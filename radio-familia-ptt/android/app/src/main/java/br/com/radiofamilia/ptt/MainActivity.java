package br.com.radiofamilia.ptt;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.ArrayList;

public class MainActivity extends Activity implements PttService.Listener {
    private final int background=Color.rgb(9,23,27);
    private final int green=Color.rgb(29,165,116);
    private EditText urlInput,codeInput,nameInput;
    private Button connectButton,talkButton;
    private TextView stateText, peopleText;
    private PttService radio;
    private boolean bound=false, pending=false, connected=false, talking=false;
    private String speaker=null;

    private final ServiceConnection serviceConnection=new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            radio=((PttService.LocalBinder)binder).getService();
            bound=true;
            radio.addListener(MainActivity.this);
            if(pending) { pending=false; connectNow(); }
        }
        @Override public void onServiceDisconnected(ComponentName name) {
            bound=false; radio=null;
            showStatus("Serviço desconectado",false,false,null,new String[0]);
        }
    };
    private int dp(int n) { return (int)(n*getResources().getDisplayMetrics().density+.5f); }
    private GradientDrawable shape(int color,int radius) {
        GradientDrawable bg=new GradientDrawable();
        bg.setColor(color); bg.setCornerRadius(dp(radius)); return bg;
    }
    private TextView text(String value,int size,int color,boolean bold) {
        TextView t=new TextView(this);
        t.setText(value); t.setTextSize(size); t.setTextColor(color);
        if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        return t;
    }
    private EditText input(String hint,String value,boolean password) {
        EditText e=new EditText(this);
        e.setTextColor(Color.WHITE); e.setHintTextColor(Color.rgb(140,170,166));
        e.setHint(hint); e.setText(value); e.setTextSize(15); e.setSingleLine(true);
        e.setPadding(dp(13),dp(10),dp(13),dp(10));
        e.setBackground(shape(Color.rgb(28,52,53),12));
        if(password)e.setInputType(0x00000081);
        return e;
    }
    private void add(LinearLayout root,View child,int top) {
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.topMargin=dp(top); root.addView(child,p);
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true); scroll.setBackgroundColor(background);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24),dp(23),dp(24),dp(30)); scroll.addView(root);
        add(root,text("RÁDIO FAMÍLIA",29,Color.WHITE,true),4);
        add(root,text("Nosso canal privado • Segure para falar",14,Color.rgb(154,187,176),false),5);
        urlInput=input("Endereço do servidor","https://radio-familia-ptt.onrender.com",false);
        String storedUrl=getPreferences(0).getString("url","");
        if(!storedUrl.isEmpty())urlInput.setText(storedUrl);
        codeInput=input("Código da família",getPreferences(0).getString("code",""),true);
        nameInput=input("Seu nome neste celular",getPreferences(0).getString("name",""),false);
        add(root,text("Servidor",13,Color.rgb(180,218,211),false),26);
        add(root,urlInput,5);
        add(root,text("Código de acesso",13,Color.rgb(180,218,211),false),15);
        add(root,codeInput,5);
        add(root,text("Nome (ex.: Pai, Bruna, Pietro)",13,Color.rgb(180,218,211),false),15);
        add(root,nameInput,5);
        connectButton=new Button(this);
        connectButton.setAllCaps(false); connectButton.setText("Conectar ao canal");
        connectButton.setTextSize(16); connectButton.setTextColor(Color.WHITE);
        connectButton.setBackground(shape(green,15));
        connectButton.setOnClickListener(v -> { if(connected) disconnect(); else connect(); });
        add(root,connectButton,22);
        stateText=text("Desconectado",17,Color.WHITE,true);
        stateText.setGravity(Gravity.CENTER); add(root,stateText,22);
        peopleText=text("Participantes: nenhum",13,Color.rgb(157,189,185),false);
        peopleText.setGravity(Gravity.CENTER); add(root,peopleText,7);
        talkButton=new Button(this);
        talkButton.setText("🎙\nSEGURE PARA FALAR");
        talkButton.setTextSize(18); talkButton.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        talkButton.setTextColor(Color.WHITE); talkButton.setAllCaps(false);
        talkButton.setBackground(shape(green,170)); talkButton.setEnabled(false);
        talkButton.setAlpha(.4f);
        talkButton.setOnTouchListener((v,event) -> {
            if(radio==null || !connected)return true;
            if(event.getAction()==MotionEvent.ACTION_DOWN) { radio.talkDown(); return true; }
            if(event.getAction()==MotionEvent.ACTION_UP || event.getAction()==MotionEvent.ACTION_CANCEL) {
                radio.talkUp(); return true;
            }
            return true;
        });
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(220),dp(220));
        p.gravity=Gravity.CENTER_HORIZONTAL; p.topMargin=dp(24); root.addView(talkButton,p);
        TextView hint=text("🔊 Áudio pelo alto-falante principal. Use os botões de volume de MÍDIA para ajustar.\nPara falar, deixe a tela do rádio aberta. Para ouvir, mantenha o canal conectado.",12,Color.rgb(150,176,174),false);
        hint.setGravity(Gravity.CENTER); add(root,hint,21);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        setContentView(scroll);
        bindService(new Intent(this,PttService.class),serviceConnection,Context.BIND_AUTO_CREATE);
        requestPermissions();
    }
    private void requestPermissions() {
        ArrayList<String> perms=new ArrayList<>();
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)
            perms.add(Manifest.permission.RECORD_AUDIO);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!perms.isEmpty())requestPermissions(perms.toArray(new String[0]),11);
    }
    private String wsUrl(String input) {
        String url=input.trim();
        if(url.startsWith("https://")) url="wss://"+url.substring(8);
        if(!url.startsWith("wss://"))return null;
        while(url.endsWith("/"))url=url.substring(0,url.length()-1);
        if(!url.endsWith("/radio"))url+="/radio";
        return url;
    }
    private void connect() {
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this,"Permita o acesso ao microfone",Toast.LENGTH_LONG).show();
            requestPermissions(); return;
        }
        if(wsUrl(urlInput.getText().toString())==null || codeInput.length()<10 ||
                nameInput.getText().toString().trim().isEmpty()) {
            Toast.makeText(this,"Confira link, código e nome",Toast.LENGTH_LONG).show(); return;
        }
        getPreferences(0).edit()
            .putString("url",urlInput.getText().toString().trim())
            .putString("code",codeInput.getText().toString())
            .putString("name",nameInput.getText().toString().trim()).apply();
        pending=true;
        try { startForegroundService(new Intent(this,PttService.class)); }
        catch(Exception e) {
            pending=false;
            Toast.makeText(this,"Não foi possível iniciar o rádio",Toast.LENGTH_LONG).show(); return;
        }
        if(radio!=null) { pending=false; connectNow(); }
        connectButton.setText("Conectando...");
    }
    private void connectNow() {
        if(radio!=null)radio.connect(wsUrl(urlInput.getText().toString()),
            codeInput.getText().toString(),nameInput.getText().toString().trim());
    }
    private void disconnect() {
        if(radio!=null)radio.disconnect();
        stopService(new Intent(this,PttService.class));
        showStatus("Desconectado",false,false,null,new String[0]);
    }
    @Override public void onStatus(String status,boolean isConnected,boolean transmitting,String who,String[] names) {
        runOnUiThread(() -> showStatus(status,isConnected,transmitting,who,names));
    }
    private void showStatus(String status,boolean isConnected,boolean transmitting,String who,String[] names) {
        connected=isConnected; talking=transmitting; speaker=who;
        stateText.setText(status);
        peopleText.setText("Conectados ("+names.length+"): "+
            (names.length==0?"nenhum":String.join(", ",names)));
        connectButton.setText(isConnected?"Desconectar":"Conectar ao canal");
        talkButton.setEnabled(isConnected); talkButton.setAlpha(isConnected?1f:.4f);
        talkButton.setText(transmitting?"🔴\nTRANSMITINDO":who!=null?"🔊\n"+who.toUpperCase()+" FALANDO":"🎙\nSEGURE PARA FALAR");
        talkButton.setBackground(shape(transmitting?Color.rgb(201,57,58):green,170));
    }
    @Override public void onDestroy() {
        if(bound && radio!=null)radio.removeListener(this);
        if(bound)unbindService(serviceConnection);
        super.onDestroy();
    }
}
