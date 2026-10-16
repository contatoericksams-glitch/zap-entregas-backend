package br.com.radiofamilia.ptt;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.*;
import android.os.*;
import android.util.Log;
import org.json.*;
import okhttp3.*;
import okio.ByteString;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class PttService extends Service {
    public interface Listener {
        void onStatus(String status, boolean connected, boolean talking, String speaker, String[] names);
    }
    public class LocalBinder extends Binder { public PttService getService() { return PttService.this; } }
    private final IBinder binder = new LocalBinder();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<Listener> listeners = new CopyOnWriteArraySet<>();
    private final ArrayBlockingQueue<byte[]> audio = new ArrayBlockingQueue<>(36);
    private final AtomicBoolean recording = new AtomicBoolean(false);
    private OkHttpClient http;
    private WebSocket socket;
    private AudioRecord mic;
    private AudioTrack track;
    private Thread recordThread, playThread;
    private volatile boolean playing, connected, talking, held, stopped = true;
    private volatile String status = "Desconectado", speaker;
    private volatile String[] names = new String[0];
    private String url, code, userName;
    private int retries = 0;

    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            if (!stopped && socket != null) {
                sendControl("ping");
                handler.postDelayed(this, 15000);
            }
        }
    };
    @Override public void onCreate() {
        super.onCreate();
        http = new OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS)
                .connectTimeout(15, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS).build();
        NotificationManager nm = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("radio", "Rádio Família", NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new Notification.Builder(this, "radio")
                .setContentTitle("Rádio Família ativo")
                .setContentText("Canal ligado. Abra o aplicativo para falar.")
                .setSmallIcon(R.drawable.ic_radio).setOngoing(true).build();
        startForeground(77, notification);
        return START_NOT_STICKY;
    }
    @Override public IBinder onBind(Intent intent) { return binder; }
    public void addListener(Listener l) { listeners.add(l); notifyOne(l); }
    public void removeListener(Listener l) { listeners.remove(l); }
    private void notifyOne(Listener l) {
        String s=status, who=speaker;
        boolean c=connected, t=talking;
        String[] n=names;
        handler.post(() -> l.onStatus(s,c,t,who,n));
    }
    private void update(String value) {
        status=value;
        for(Listener l: listeners) notifyOne(l);
    }
    public synchronized void connect(String address, String secret, String name) {
        stopped=false;
        url=address; code=secret; userName=name; retries=0;
        open();
    }
    private void open() {
        if(stopped || url == null) return;
        WebSocket old=socket;
        socket=null;
        if(old != null) old.cancel();
        connected=false; talking=false; speaker=null; names=new String[0];
        update("Conectando...");
        try {
            socket=http.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
                @Override public void onOpen(WebSocket ws, Response response) {
                    try {
                        JSONObject join=new JSONObject();
                        join.put("type","join");
                        join.put("code",code);
                        join.put("name",userName);
                        ws.send(join.toString());
                    } catch(JSONException e) { update("Não foi possível entrar"); }
                }
                @Override public void onMessage(WebSocket ws, String json) { handle(json); }
                @Override public void onMessage(WebSocket ws, ByteString data) {
                    if(connected && !talking) {
                        byte[] pcm=data.toByteArray();
                        if(!audio.offer(pcm)) { audio.poll(); audio.offer(pcm); }
                    }
                }
                @Override public void onClosing(WebSocket ws,int code,String reason) { ws.close(1000,null); }
                @Override public void onClosed(WebSocket ws,int code,String reason) {
                    if(socket != ws) return;
                    boolean fatal = code >= 4001 && code <= 4005;
                    connectionEnded(fatal ? "Acesso recusado: "+reason : "Desconectado", fatal);
                }
                @Override public void onFailure(WebSocket ws, Throwable error, Response response) {
                    if(socket != ws) return;
                    connectionEnded("Sem conexão. Reconectando...",false);
                }
            });
        } catch(Exception e) { connectionEnded("URL inválida",true); }
    }
    private void handle(String text) {
        try {
            JSONObject p=new JSONObject(text);
            switch(p.optString("type")) {
                case "joined":
                    connected=true; retries=0;
                    startPlaying();
                    handler.removeCallbacks(heartbeat);
                    handler.postDelayed(heartbeat,15000);
                    update("Canal conectado");
                    break;
                case "state":
                    JSONArray a=p.optJSONArray("participants");
                    if(a!=null) {
                        String[] v=new String[a.length()];
                        for(int i=0;i<a.length();i++) v[i]=a.optString(i);
                        names=v;
                    }
                    speaker=p.isNull("speaker") ? null : p.optString("speaker",null);
                    if(talking && speaker==null) stopRecording();
                    update(speaker==null?"Pronto para falar":speaker+" está falando");
                    break;
                case "granted":
                    if(held) startRecording(); else sendControl("release");
                    break;
                case "speaker":
                    speaker=p.isNull("name")?null:p.optString("name",null);
                    if(speaker==null) {
                        audio.clear();
                        if(talking) stopRecording();
                    }
                    update(talking?"Transmitindo...":speaker==null?"Pronto para falar":speaker+" está falando");
                    break;
                case "busy":
                    update(p.optString("name","Outra pessoa")+" está falando. Aguarde.");
                    break;
            }
        } catch(JSONException e) { Log.w("RadioFamilia","Pacote JSON inválido"); }
    }
    private void connectionEnded(String message, boolean fatal) {
        connected=false; held=false; stopRecording(); stopPlaying();
        speaker=null; names=new String[0];
        handler.removeCallbacks(heartbeat);
        if(fatal) stopped=true;
        update(message);
        if(!stopped) {
            long delay=Math.min(20000,2000L*(1L<<Math.min(retries++,4)));
            handler.postDelayed(() -> { if(!stopped) open(); },delay);
        }
    }
    private void sendControl(String type) {
        WebSocket ws=socket;
        if(ws!=null) ws.send("{\"type\":\""+type+"\"}");
    }
    public void talkDown() {
        if(!connected || talking) return;
        held=true; sendControl("talk");
    }
    public void talkUp() {
        held=false; stopRecording();
        if(connected) sendControl("release");
    }
    private synchronized void startRecording() {
        if(!connected || !held || recording.get() ||
                checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            sendControl("release"); return;
        }
        try {
            int min=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
            // Captura normal do microfone: não coloca o áudio no perfil de chamada telefônica.
            mic=new AudioRecord(MediaRecorder.AudioSource.MIC,16000,
                    AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min,4096));
            if(mic.getState()!=AudioRecord.STATE_INITIALIZED) {
                mic.release(); mic=null; update("Microfone indisponível"); sendControl("release"); return;
            }
            mic.startRecording();
            recording.set(true); talking=true; update("Transmitindo...");
            AudioRecord input=mic;
            recordThread=new Thread(() -> {
                byte[] frame=new byte[640];
                while(recording.get()) {
                    int n;
                    try { n=input.read(frame,0,frame.length); }
                    catch(Exception e) { break; }
                    WebSocket ws=socket;
                    if(n>0 && recording.get() && ws!=null)
                        ws.send(ByteString.of(Arrays.copyOf(frame,n)));
                }
            },"radio-microfone");
            recordThread.start();
        } catch(Exception e) {
            recording.set(false); talking=false; update("Erro ao iniciar microfone");
            sendControl("release");
        }
    }
    private synchronized void stopRecording() {
        recording.set(false); talking=false;
        AudioRecord old=mic; mic=null;
        if(old!=null) {
            try { old.stop(); } catch(Exception ignored) {}
            try { old.release(); } catch(Exception ignored) {}
        }
    }
    private synchronized void startPlaying() {
        stopPlaying();
        try {
            int min=AudioTrack.getMinBufferSize(16000,AudioFormat.CHANNEL_OUT_MONO,AudioFormat.ENCODING_PCM_16BIT);
            track=new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                    // Uso MEDIA envia a voz para o alto-falante externo do celular, não para o auricular de chamada.
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(16000)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(Math.max(min,8192))
                .setTransferMode(AudioTrack.MODE_STREAM).build();
            // Prefere explicitamente o alto-falante principal, mesmo em aparelhos com rota
            // de voz configurada para o auricular. Se o aparelho não aceitar a preferência,
            // USAGE_MEDIA mantém a rota normal de mídia como alternativa.
            AudioManager manager=(AudioManager)getSystemService(AUDIO_SERVICE);
            if(manager!=null) {
                for(AudioDeviceInfo output: manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                    if(output.getType()==AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        if(!track.setPreferredDevice(output))
                            Log.w("RadioFamilia","Sistema não aceitou a rota preferida de alto-falante");
                        break;
                    }
                }
            }
            track.play();
            playing=true;
            AudioTrack output=track;
            playThread=new Thread(() -> {
                while(playing) {
                    try {
                        byte[] frame=audio.poll(200,TimeUnit.MILLISECONDS);
                        if(frame!=null && playing) output.write(frame,0,frame.length);
                    } catch(InterruptedException e) { break; }
                    catch(Exception e) { break; }
                }
            },"radio-recepcao");
            playThread.start();
        } catch(Exception e) { update("Falha no alto-falante"); }
    }
    private synchronized void stopPlaying() {
        playing=false; audio.clear();
        if(playThread!=null) playThread.interrupt();
        playThread=null;
        AudioTrack old=track; track=null;
        if(old!=null) {
            try { old.pause(); } catch(Exception ignored) {}
            try { old.flush(); } catch(Exception ignored) {}
            try { old.release(); } catch(Exception ignored) {}
        }
    }
    public synchronized void disconnect() {
        stopped=true; handler.removeCallbacks(heartbeat);
        held=false; stopRecording(); stopPlaying();
        if(socket!=null) { socket.close(1000,"Saindo"); socket=null; }
        connected=false; speaker=null; names=new String[0]; update("Desconectado");
    }
    @Override public void onDestroy() {
        disconnect();
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
        super.onDestroy();
    }
}
