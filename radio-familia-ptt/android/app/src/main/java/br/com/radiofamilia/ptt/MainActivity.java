package br.com.radiofamilia.ptt;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.*;

public class MainActivity extends Activity implements PttService.Listener {
    private final int BG=Color.rgb(5,12,11), PANEL=Color.rgb(13,24,21),
      GREEN=Color.rgb(39,237,110), MUTED=Color.rgb(143,166,155),
      WHITE=Color.rgb(236,247,241), BLUE=Color.rgb(51,180,252), RED=Color.rgb(252,73,87);
    private LinearLayout root,channelsContainer,peopleContainer,settingsPanel;
    private TextView stateText,countText,channelText,whoText,radioState;
    private EditText addressField,secretField,nameField;
    private Switch powerSwitch;
    private MatrixPttView ptt;
    private MatrixMeterView meter;
    private PttService radio;
    private boolean bound=false,pending=false,connected=false,requested=false,updatingToggle=false;
    private String speaking=null,active="ch01";
    private String[] lastChannelIds=new String[0],lastChannelNames=new String[0];
    private String[] activeRoomNames=new String[0];
    private boolean[] activeRoomOnline=new boolean[0];
    private String[][] lastRosters=new String[0][];
    private final ServiceConnection serviceConnection=new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name,IBinder binder) {
            radio=((PttService.LocalBinder)binder).getService();
            bound=true;radio.addListener(MainActivity.this);
            if(pending){pending=false;connectNow();}
        }
        @Override public void onServiceDisconnected(ComponentName name) {
            bound=false;radio=null; connected=false;applyState("Serviço indisponível",false,false,null,new String[0]);
        }
    };
    private int dp(float x){return (int)(getResources().getDisplayMetrics().density*x+.5f);}
    private GradientDrawable back(int fill,int stroke,float corner) {
        GradientDrawable gd=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{fill,Color.rgb(4,12,11)});
        gd.setCornerRadius(dp(corner));gd.setStroke(dp(1),stroke);return gd;
    }
    private TextView label(String s,int size,int color,boolean bold) {
        TextView v=new TextView(this);v.setText(s);v.setTextSize(size);v.setTextColor(color);
        if(bold)v.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);
        return v;
    }
    private LinearLayout column(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout line(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private LinearLayout card(){LinearLayout v=column();v.setPadding(dp(15),dp(13),dp(15),dp(13));v.setBackground(back(PANEL,Color.rgb(43,79,61),15));return v;}
    private void full(LinearLayout parent,View v,int mt){
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(mt);parent.addView(v,lp);
    }
    private void space(LinearLayout parent,View v,int w){
        parent.addView(v,new LinearLayout.LayoutParams(dp(w),-2));
    }
    private EditText edit(String hint,String initial,boolean secret){
        EditText e=new EditText(this);e.setSingleLine(true);e.setTextColor(WHITE);
        e.setHintTextColor(MUTED);e.setTextSize(14);e.setHint(hint);e.setText(initial);
        e.setPadding(dp(12),dp(9),dp(12),dp(9));
        e.setBackground(back(Color.rgb(16,35,28),Color.rgb(35,74,52),10));
        if(secret)e.setInputType(129);
        return e;
    }
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);scroll.setBackgroundColor(BG);
        root=column();root.setPadding(dp(16),dp(19),dp(16),dp(28));scroll.addView(root);

        LinearLayout header=line();
        LinearLayout heading=column();
        TextView title=label("RÁDIO FAMÍLIA",27,WHITE,true);
        heading.addView(title);heading.addView(label("TÁTICO MATRIX  •  COMUNICAÇÃO DIGITAL",10,GREEN,true));
        header.addView(heading,new LinearLayout.LayoutParams(0,-2,1f));
        TextView gear=label("⚙",27,GREEN,true);gear.setGravity(Gravity.CENTER);
        gear.setBackground(back(PANEL,Color.rgb(39,78,52),12));
        gear.setOnClickListener(v->settingsPanel.setVisibility(settingsPanel.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
        header.addView(gear,new LinearLayout.LayoutParams(dp(48),dp(48)));
        full(root,header,0);

        LinearLayout power=card();
        LinearLayout powerRow=line();
        LinearLayout tcol=column();
        radioState=label("● RÁDIO DESLIGADO",15,WHITE,true);
        tcol.addView(radioState);tcol.addView(label("Canal privado • Áudio pela internet",12,MUTED,false));
        powerRow.addView(tcol,new LinearLayout.LayoutParams(0,-2,1f));
        powerSwitch=new Switch(this);powerSwitch.setText("");powerSwitch.setShowText(false);
        powerRow.addView(powerSwitch);
        power.addView(powerRow);full(root,power,20);

        LinearLayout channels=card();
        TextView channelLabel=label("◈  CANAIS / FREQUÊNCIAS",12,MUTED,true);
        channels.addView(channelLabel);
        HorizontalScrollView horizontal=new HorizontalScrollView(this);
        horizontal.setHorizontalScrollBarEnabled(false);
        channelsContainer=line();horizontal.addView(channelsContainer);
        LinearLayout.LayoutParams h=new LinearLayout.LayoutParams(-1,dp(73));h.topMargin=dp(9);
        channels.addView(horizontal,h);
        full(root,channels,11);

        LinearLayout status=card();
        LinearLayout row=line();
        LinearLayout indicator=column();
        stateText=label("Desconectado",17,RED,true);
        indicator.addView(label("ESTADO DO CANAL",10,MUTED,true));indicator.addView(stateText);
        row.addView(indicator,new LinearLayout.LayoutParams(0,-2,1));
        countText=label("0 online",13,MUTED,true);row.addView(countText);
        status.addView(row);
        channelText=label("Aguardando conexão",12,MUTED,false);full(status,channelText,8);
        HorizontalScrollView peopleScroll=new HorizontalScrollView(this);peopleScroll.setHorizontalScrollBarEnabled(false);
        peopleContainer=line();peopleScroll.addView(peopleContainer);
        full(status,peopleScroll,10);
        full(root,status,11);

        ptt=new MatrixPttView(this);
        LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(dp(265),dp(265));
        pp.topMargin=dp(10);pp.gravity=Gravity.CENTER_HORIZONTAL;root.addView(ptt,pp);

        LinearLayout audioControls=line();
        TextView speaker=label("▮))  ALTO-FALANTE\n      ATIVO",12,GREEN,true);
        speaker.setGravity(Gravity.CENTER);speaker.setPadding(dp(7),dp(9),dp(7),dp(9));
        speaker.setBackground(back(PANEL,Color.rgb(31,110,68),12));
        audioControls.addView(speaker,new LinearLayout.LayoutParams(0,dp(58),1));
        space(audioControls,new View(this),10);
        TextView secure=label("🔒  CANAL PRIVADO\n       VIA INTERNET",12,MUTED,true);
        secure.setGravity(Gravity.CENTER);secure.setPadding(dp(7),dp(9),dp(7),dp(9));
        secure.setBackground(back(PANEL,Color.rgb(43,79,61),12));
        audioControls.addView(secure,new LinearLayout.LayoutParams(0,dp(58),1));
        full(root,audioControls,1);

        LinearLayout audio=card();
        whoText=label("◉  Aguardando transmissão",16,WHITE,true);
        audio.addView(whoText);
        meter=new MatrixMeterView(this);
        full(audio,meter,8);meter.getLayoutParams().height=dp(90);
        full(root,audio,12);

        TextView settingsButton=label("⚙  AJUSTES AVANÇADOS   ▾",14,WHITE,true);
        settingsButton.setPadding(dp(14),dp(15),dp(14),dp(15));
        settingsButton.setBackground(back(PANEL,Color.rgb(43,79,61),14));
        settingsButton.setOnClickListener(v->settingsPanel.setVisibility(settingsPanel.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
        full(root,settingsButton,13);
        settingsPanel=card();
        full(settingsPanel,label("SERVIDOR",11,MUTED,true),2);
        addressField=edit("Servidor","https://radio-familia-v2-matrix.onrender.com",false);
        addressField.setText(getPreferences(0).getString("url","https://radio-familia-v2-matrix.onrender.com"));
        full(settingsPanel,addressField,6);
        full(settingsPanel,label("CÓDIGO FAMILIAR",11,MUTED,true),13);
        secretField=edit("Código de acesso",getPreferences(0).getString("code",""),true);
        full(settingsPanel,secretField,6);
        full(settingsPanel,label("SEU NOME",11,MUTED,true),13);
        nameField=edit("Erick, Bruna ou Pietro",getPreferences(0).getString("name",""),false);
        full(settingsPanel,nameField,6);
        full(settingsPanel,label("Piloto familiar: apenas participantes cadastrados. Para instituições, será necessária autenticação individual.",11,MUTED,false),12);
        full(root,settingsPanel,5);
        settingsPanel.setVisibility(secretField.length()==0||nameField.length()==0?View.VISIBLE:View.GONE);

        powerSwitch.setOnCheckedChangeListener((btn,on)->{
            if(updatingToggle)return;
            if(on)connect();else disconnect();
        });
        setContentView(scroll);
        showEmptyChannels();
        ptt.setEnabled(false);
        bindService(new Intent(this,PttService.class),serviceConnection,Context.BIND_AUTO_CREATE);
        requestPermissions();
    }
    private void requestPermissions(){
        ArrayList<String> perms=new ArrayList<>();
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)perms.add(Manifest.permission.RECORD_AUDIO);
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)perms.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!perms.isEmpty())requestPermissions(perms.toArray(new String[0]),19);
    }
    private String wsUrl(String raw){
        String url=raw.trim();
        if(url.startsWith("https://"))url="wss://"+url.substring(8);
        if(!url.startsWith("wss://"))return null;
        while(url.endsWith("/"))url=url.substring(0,url.length()-1);
        if(!url.endsWith("/radio"))url+="/radio";
        return url;
    }
    private void setPower(boolean on){
        updatingToggle=true;powerSwitch.setChecked(on);updatingToggle=false;
    }
    private void connect(){
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions();Toast.makeText(this,"Autorize o microfone",Toast.LENGTH_LONG).show();
            setPower(false);return;
        }
        if(wsUrl(addressField.getText().toString())==null||secretField.length()<12||nameField.length()==0){
            Toast.makeText(this,"Preencha nome, código e servidor nos Ajustes",Toast.LENGTH_LONG).show();
            settingsPanel.setVisibility(View.VISIBLE);setPower(false);return;
        }
        getPreferences(0).edit().putString("url",addressField.getText().toString().trim())
          .putString("code",secretField.getText().toString())
          .putString("name",nameField.getText().toString().trim()).apply();
        requested=true;pending=true;
        radioState.setText("● RÁDIO LIGADO");
        stateText.setText("Conectando...");stateText.setTextColor(GREEN);
        try{startForegroundService(new Intent(this,PttService.class));}
        catch(Exception e){pending=false;requested=false;setPower(false);Toast.makeText(this,"Não foi possível iniciar o rádio",Toast.LENGTH_LONG).show();return;}
        if(radio!=null){pending=false;connectNow();}
    }
    private void connectNow(){
        if(radio!=null)radio.connect(wsUrl(addressField.getText().toString()),secretField.getText().toString(),nameField.getText().toString().trim());
    }
    private void disconnect(){
        requested=false;pending=false;
        if(radio!=null)radio.disconnect();
        stopService(new Intent(this,PttService.class));
        connected=false;
        applyState("Desconectado",false,false,null,new String[0]);
    }
    private void showEmptyChannels(){
        lastChannelIds=new String[]{"ch01","ch02","ch03","ch04"};
        lastChannelNames=new String[]{"Família","Erick + Bruna","Erick + Pietro","Bruna + Pietro"};
        lastRosters=new String[][]{{"Erick","Bruna","Pietro"},{"Erick","Bruna"},{"Erick","Pietro"},{"Bruna","Pietro"}};
        showChannels();
    }
    private void showChannels(){
        channelsContainer.removeAllViews();
        for(int i=0;i<lastChannelIds.length;i++){
            if(lastChannelIds[i]==null)continue;
            final String id=lastChannelIds[i];
            boolean activeChannel=id.equals(active);
            LinearLayout tile=column();tile.setGravity(Gravity.CENTER_VERTICAL);
            tile.setPadding(dp(12),dp(7),dp(12),dp(7));
            tile.setBackground(back(activeChannel?Color.rgb(8,51,30):PANEL,activeChannel?GREEN:Color.rgb(50,74,59),10));
            tile.addView(label("CH "+String.format(java.util.Locale.US,"%02d",i+1),11,activeChannel?GREEN:MUTED,true));
            LinearLayout titleRow=line();
            TextView n=label(lastChannelNames[i],13,WHITE,true);n.setSingleLine(true);
            titleRow.addView(n);
            if(activeChannel && activeRoomNames.length>0) {
                for(int j=0;j<activeRoomNames.length;j++) {
                    int dotColor=j<activeRoomOnline.length&&activeRoomOnline[j]?GREEN:RED;
                    TextView dot=label(" ●",10,dotColor,true);titleRow.addView(dot);
                }
            }
            tile.addView(titleRow);
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,dp(61));lp.rightMargin=dp(8);channelsContainer.addView(tile,lp);
            tile.setOnClickListener(v->{
                if(!connected){Toast.makeText(this,"Ligue o rádio primeiro",Toast.LENGTH_SHORT).show();return;}
                active=id;showChannels();if(radio!=null)radio.changeChannel(id);
            });
        }
    }
    private void showMembers(String[] roster,boolean[] online,String speaker){
        activeRoomNames=roster;activeRoomOnline=online;
        peopleContainer.removeAllViews();
        showChannels();
        for(int i=0;i<roster.length;i++){
            final String user=roster[i];final boolean on=i<online.length && online[i];
            final boolean speakingNow=on&&user.equals(speaker);
            final int color=speakingNow?BLUE:on?GREEN:RED;
            TextView chip=label("●  "+user,12,color,true);
            chip.setPadding(dp(10),dp(7),dp(10),dp(7));
            chip.setBackground(back(Color.rgb(14,30,26),on?Color.rgb(47,76,55):Color.rgb(86,36,44),20));
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.rightMargin=dp(7);
            peopleContainer.addView(chip,lp);
        }
    }
    private void applyState(String status,boolean isConnected,boolean transmitting,String who,String[] names){
        connected=isConnected;speaking=who;
        stateText.setText(status);stateText.setTextColor(isConnected?GREEN:status.contains("Reconect")?Color.rgb(247,193,61):RED);
        radioState.setText(requested?"● RÁDIO LIGADO":"● RÁDIO DESLIGADO");
        radioState.setTextColor(requested?GREEN:MUTED);
        countText.setText(names.length+" online");
        ptt.setEnabled(isConnected);ptt.setTalking(transmitting);ptt.setReceiving(!transmitting && who!=null);
        meter.setActive(isConnected && (transmitting || who!=null));
        whoText.setText(transmitting?"◉  TRANSMITINDO":who!=null?"◉  "+who+" está falando":"◉  Aguardando transmissão");
        whoText.setTextColor(transmitting?RED:who!=null?BLUE:WHITE);
        if(!isConnected){showMembers(new String[0],new boolean[0],null);}
    }
    @Override public void onStatus(String status,boolean isConnected,boolean transmitting,String who,String[] names){
        runOnUiThread(()->applyState(status,isConnected,transmitting,who,names));
    }
    @Override public void onChannels(String[] ids,String[] names,String[][] rosters,String selected){
        runOnUiThread(()->{
            lastChannelIds=ids;lastChannelNames=names;lastRosters=rosters;
            active=selected;showChannels();
            int ix=Arrays.asList(ids).indexOf(active);
            channelText.setText(ix>=0?"CANAL ATIVO: "+names[ix]:"Canal privado");
        });
    }
    @Override public void onRoom(String channel,String[] roster,boolean[] online,String speaker){
        runOnUiThread(()->{if(channel.equals(active))showMembers(roster,online,speaker);});
    }
    @Override public void onLevel(int level){runOnUiThread(()->meter.setLevel(level));}
    @Override public void onDestroy(){
        if(bound&&radio!=null)radio.removeListener(this);
        if(bound)unbindService(serviceConnection);
        super.onDestroy();
    }
    private class MatrixPttView extends View {
        private Paint paint=new Paint(3);
        private boolean talking=false,receiving=false,down=false;
        MatrixPttView(Context c){super(c);setLayerType(View.LAYER_TYPE_SOFTWARE,null);}
        void setTalking(boolean v){talking=v;invalidate();}
        void setReceiving(boolean v){receiving=v;invalidate();}
        private void ring(Canvas c,float cx,float cy,float r,int color,float stroke) {
            paint.setShader(null);paint.setColor(color);paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(stroke);paint.setShadowLayer(dp(8),0,0,color);
            c.drawCircle(cx,cy,r,paint);paint.clearShadowLayer();paint.setStyle(Paint.Style.FILL);
        }
        @Override protected void onDraw(Canvas c) {
            float w=getWidth(),h=getHeight(),cx=w/2,cy=h/2,r=Math.min(w,h)*.43f;
            int color=!isEnabled()?Color.rgb(52,89,70):talking?RED:receiving?BLUE:GREEN;
            paint.clearShadowLayer();paint.setStyle(Paint.Style.FILL);
            paint.setShader(new LinearGradient(0,0,w,h,Color.rgb(28,47,39),Color.rgb(2,9,8),Shader.TileMode.CLAMP));
            c.drawCircle(cx,cy,r+dp(14),paint);paint.setShader(null);
            ring(c,cx,cy,r+dp(5),Color.rgb(35,66,51),dp(8));
            ring(c,cx,cy,r,color,dp(6));
            paint.setColor(Color.rgb(7,18,15));paint.setStyle(Paint.Style.FILL);
            c.drawCircle(cx,cy,r-dp(8),paint);
            paint.setColor(color);paint.setTypeface(Typeface.DEFAULT_BOLD);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setShadowLayer(dp(10),0,0,color);
            float my=cy-dp(28);
            float micW=dp(17),micH=dp(53);
            c.drawRoundRect(cx-micW/2,my-micH/2,cx+micW/2,my+micH/2,dp(11),dp(11),paint);
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(5));
            c.drawArc(cx-dp(23),my-dp(18),cx+dp(23),my+dp(34),0,180,false,paint);
            c.drawLine(cx,my+dp(35),cx,my+dp(46),paint);
            c.drawLine(cx-dp(14),my+dp(47),cx+dp(14),my+dp(47),paint);
            paint.setStyle(Paint.Style.FILL);paint.clearShadowLayer();
            paint.setColor(WHITE);paint.setTextSize(dp(19));
            c.drawText(talking?"TRANSMITINDO":receiving?"RECEBENDO":"SEGURE",cx,cy+dp(23),paint);
            c.drawText(talking?"SOLTE PARA OUVIR":receiving?"ÁUDIO":"PARA FALAR",cx,cy+dp(47),paint);
        }
        @Override public boolean onTouchEvent(android.view.MotionEvent event){
            if(!isEnabled())return true;
            switch(event.getActionMasked()){
                case MotionEvent.ACTION_DOWN:
                    getParent().requestDisallowInterceptTouchEvent(true);
                    down=true;if(radio!=null)radio.talkDown();
                    return true;
                case MotionEvent.ACTION_UP:
                    if(down&&radio!=null)radio.talkUp();down=false;performClick();return true;
                case MotionEvent.ACTION_CANCEL:
                    if(down&&radio!=null)radio.talkUp();down=false;return true;
            }
            return true;
        }
        @Override public boolean performClick(){super.performClick();return true;}
    }
    private class MatrixMeterView extends View {
        private final Paint p=new Paint(3);
        private final java.util.Random random=new java.util.Random(3);
        private final float[] levels=new float[31];
        private int inputLevel=0;
        private boolean active=false;
        MatrixMeterView(Context context){super(context);}
        void setLevel(int n){inputLevel=Math.max(0,Math.min(100,n));invalidate();}
        void setActive(boolean yes){active=yes;if(!yes)inputLevel=0;invalidate();}
        @Override protected void onDraw(Canvas canvas){
            int w=getWidth(),h=getHeight();if(w==0)return;
            float per=w/(float)(levels.length+1),base=h*.87f;
            for(int i=0;i<levels.length;i++){
                float target=active?(0.12f+Math.max(.12f,inputLevel/100f)*(0.38f+random.nextFloat()*.55f)):.07f;
                levels[i]=levels[i]*.50f+target*.50f;
                float barH=Math.max(dp(4),levels[i]*h*.82f);
                p.setColor(active?GREEN:Color.rgb(42,81,55));
                p.setShadowLayer(active?dp(5):0,0,0,GREEN);
                canvas.drawRoundRect(i*per+dp(3),base-barH,i*per+per*.65f,base,dp(4),dp(4),p);
            }
            p.clearShadowLayer();
            if(active)postInvalidateDelayed(95);
        }
    }
}
