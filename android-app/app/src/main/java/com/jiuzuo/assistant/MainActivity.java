package com.jiuzuo.assistant;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * 久坐活动助手的安卓外壳。
 *
 * 设计取舍：
 * 1. 用 WebView 加载内网地址，前端更新后无需重新打包。
 * 2. 不依赖 AndroidX / Gradle 插件，方便用命令行直接编译出 APK。
 * 3. 服务器地址存在 SharedPreferences，连不上时可以让用户改，换网络/IP 不用重装。
 */
public class MainActivity extends Activity {

    private static final String PREFS = "jiuzuo";
    private static final String KEY_URL = "server_url";
    /** 默认地址；打包时会替换成构建机当前的局域网 IP。 */
    private static final String DEFAULT_URL = "http://192.168.0.12:5173/";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 内网演示包，开调试通道便于用 chrome://inspect 排查页面问题
        WebView.setWebContentsDebuggingEnabled(true);
        String saved = prefs().getString(KEY_URL, "");
        // 首次启动直接用打包时写入的默认地址，点开即可演示；
        // 连不上时会落到兜底页，那里有「修改地址」入口。
        showWeb(saved.length() == 0 ? DEFAULT_URL : saved);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private int dp(int value) {
        return Math.round(getResources().getDisplayMetrics().density * value);
    }

    /** 首次启动、或地址失效时，让用户填服务器地址。 */
    private void showSetup(String preset, boolean canCancel) {
        releaseWebView();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));
        root.setBackgroundColor(Color.parseColor("#F4F5F8"));

        TextView title = new TextView(this);
        title.setText("连接演示服务");
        title.setTextSize(22);
        title.setTextColor(Color.parseColor("#101828"));
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText("填写运行演示服务那台电脑的地址，例如：\nhttp://192.168.0.12:5173\n\n手机需要和电脑在同一个局域网。");
        hint.setTextSize(14);
        hint.setTextColor(Color.parseColor("#667085"));
        hint.setLineSpacing(dp(4), 1f);
        hint.setPadding(0, dp(10), 0, dp(20));
        root.addView(hint);

        final EditText input = new EditText(this);
        input.setText(preset);
        input.setHint("http://192.168.0.12:5173");
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setTextSize(16);
        root.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button save = new Button(this);
        save.setText("保存并打开");
        save.setAllCaps(false);
        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String url = normalize(input.getText().toString());
                if (url.length() == 0) {
                    Toast.makeText(MainActivity.this, "请先填写地址", Toast.LENGTH_SHORT).show();
                    return;
                }
                prefs().edit().putString(KEY_URL, url).apply();
                showWeb(url);
            }
        });
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnLp.topMargin = dp(20);
        root.addView(save, btnLp);

        if (canCancel) {
            Button cancel = new Button(this);
            cancel.setText("取消");
            cancel.setAllCaps(false);
            cancel.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showWeb(prefs().getString(KEY_URL, DEFAULT_URL));
                }
            });
            LinearLayout.LayoutParams cancelLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            cancelLp.topMargin = dp(8);
            root.addView(cancel, cancelLp);
        }

        setContentView(root);
    }

    /** 补全用户省略的部分，容忍只填 IP 或 IP:端口。 */
    private String normalize(String raw) {
        String url = raw == null ? "" : raw.trim();
        if (url.length() == 0) return "";
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        // 只有主机名、没有路径时补一个 /
        if (url.matches("https?://[^/]+")) {
            url = url + "/";
        }
        return url;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showWeb(String url) {
        releaseWebView();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // 固定字号，避免系统字体放大后页面布局错位
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // 页面上有"完成/推迟"这类按钮，避免误触发长按选择
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setBackgroundColor(Color.parseColor("#F4F5F8"));

        webView.setWebChromeClient(new WebChromeClient() {
            /**
             * 把页面里的 console 输出转到 logcat（tag: WebViewConsole）。
             * WebView 默认不转发，页面白屏时否则完全看不到 JS 报错。
             * 排查命令：adb logcat -s WebViewConsole
             */
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(
                        "WebViewConsole",
                        cm.messageLevel() + " " + cm.message()
                                + " @" + cm.sourceId() + ":" + cm.lineNumber());
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // 只处理主文档失败，忽略单个资源加载失败
                if (request.isForMainFrame()) {
                    showOffline(request.getUrl() == null ? "" : request.getUrl().toString());
                }
            }
        });

        webView.loadUrl(url);
        setContentView(webView);
    }

    /** 连不上服务时的兜底页，给"重试"和"改地址"两个出口。 */
    private void showOffline(String failedUrl) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(28), dp(28), dp(28));
        root.setBackgroundColor(Color.parseColor("#F4F5F8"));

        TextView title = new TextView(this);
        title.setText("连不上演示服务");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#101828"));
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView detail = new TextView(this);
        String shown = failedUrl.length() > 0 ? failedUrl : prefs().getString(KEY_URL, DEFAULT_URL);
        detail.setText("地址：" + shown + "\n\n请确认：\n· 电脑上的演示服务已启动\n· 手机和电脑在同一个局域网\n· 电脑防火墙允许 5173 端口");
        detail.setTextSize(14);
        detail.setTextColor(Color.parseColor("#667085"));
        detail.setLineSpacing(dp(4), 1f);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, dp(16), 0, dp(24));
        root.addView(detail);

        Button retry = new Button(this);
        retry.setText("重试");
        retry.setAllCaps(false);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showWeb(prefs().getString(KEY_URL, DEFAULT_URL));
            }
        });
        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        root.addView(retry, lp1);

        Button change = new Button(this);
        change.setText("修改地址");
        change.setAllCaps(false);
        change.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSetup(prefs().getString(KEY_URL, DEFAULT_URL), true);
            }
        });
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp2.topMargin = dp(8);
        root.addView(change, lp2);

        setContentView(root);
    }

    /**
     * 返回键：页面能后退就先后退，否则退到后台而不是直接退出。
     *
     * 直接退出会很坑——用户在输入框里按返回想收键盘，结果整个 App 没了。
     * 退到后台可以保留 WebView 状态，再点图标回到原处。
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            moveTaskToBack(true);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    private void releaseWebView() {
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
    }

    @Override
    protected void onDestroy() {
        releaseWebView();
        super.onDestroy();
    }
}
