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
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URL;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

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
    /** 打包时的默认地址，只在从没连上过、也没找到服务时兜底。 */
    private static final String DEFAULT_URL = "http://192.168.0.12:5173/";

    /** 前端 dev server 端口。自动发现就是找同网段谁开了这个端口并返回本项目的页面。 */
    private static final int SERVER_PORT = 5173;
    /** 页面 title 里的关键字，用来确认对面确实是本项目，而不是网段里随便一个 5173 服务。 */
    private static final String SERVICE_MARK = "久坐";
    /** 两次自动查找的最小间隔：WebView 反复失败时不要变成扫描风暴。 */
    private static final long AUTO_SCAN_COOLDOWN_MS = 8000;

    private WebView webView;
    private long lastAutoScanAt = 0;
    private boolean scanning = false;
    private boolean awaitingReconnect = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 内网演示包，开调试通道便于用 chrome://inspect 排查页面问题
        WebView.setWebContentsDebuggingEnabled(true);
        String saved = prefs().getString(KEY_URL, "");
        if (saved.length() == 0) {
            // 第一次打开：不写死 IP，直接在本网段找一遍，找到才联网
            discover(false, "");
        } else {
            // 有上次成功的地址就先试它；万一失效，onReceivedError 会自动重找
            showWeb(saved);
        }
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

    // ---------- 局域网自动发现 ----------

    /**
     * 在手机所在网段里找演示服务，找到就把它记下来并打开。
     *
     * 为什么要扫：地址写死成某个 IP 后，电脑换网、DHCP 重新分配都会让 App 连不上，
     * 用户不得不手动填地址。这里同网段并发探端口 + 校验页面身份，通常一两秒就出结果。
     */
    private void discover(final boolean auto, final String failedUrl) {
        releaseWebView();
        scanning = true;
        awaitingReconnect = false;
        showSearching();

        new Thread(new Runnable() {
            @Override
            public void run() {
                final List<String> hosts = candidateHosts();
                final String hit = scanHosts(hosts);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        scanning = false;
                        if (hit != null) {
                            String url = normalize(hit);
                            prefs().edit().putString(KEY_URL, url).apply();
                            showWeb(url);
                        } else {
                            showOffline(failedUrl, hosts.size(), auto);
                        }
                    }
                });
            }
        }).start();
    }

    /** 本机所在网段的候选主机地址，先验地址排在前面以便秒开。 */
    private List<String> candidateHosts() {
        LinkedHashSet<String> hosts = new LinkedHashSet<>();

        // 1. 先验：上次连上的地址、打包时写入的地址。命中就不用扫全网段
        addPrior(hosts, prefs().getString(KEY_URL, ""));
        addPrior(hosts, DEFAULT_URL);
        // 2. 默认网关：模拟器 NAT 场景下网关常常就是宿主机
        addGateway(hosts);

        // 3. 退而求其次：扫本机所在的 /24 网段
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            while (ifs.hasMoreElements()) {
                NetworkInterface nif = ifs.nextElement();
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InterfaceAddress ia : nif.getInterfaceAddresses()) {
                    InetAddress addr = ia.getAddress();
                    if (!(addr instanceof Inet4Address)) continue;
                    if (addr.isLoopbackAddress() || addr.isLinkLocalAddress()) continue;
                    addRange(hosts, addr.getAddress(), ia.getNetworkPrefixLength());
                }
            }
        } catch (Exception ignored) {
            // 拿不到网卡信息就交给调用方走兜底页
        }
        return new ArrayList<>(hosts);
    }

    private void addPrior(Set<String> out, String url) {
        if (url == null || url.length() == 0) return;
        String host = hostOf(url);
        if (host.length() > 0) out.add(host);
    }

    private String hostOf(String url) {
        try {
            String host = new URL(url).getHost();
            return host == null ? "" : host;
        } catch (Exception ignored) {
            return "";
        }
    }

    /**
     * 读 /proc/net/route 拿默认网关。
     *
     * 模拟器多为 NAT 模式，自身 IP 和宿主机不在同一网段，扫 /24 是扫不到的；
     * 而网关地址（如 Android 模拟器的 10.0.2.2）通常就指向宿主机，值得一试。
     * 读这个文件不需要任何权限。
     */
    private void addGateway(Set<String> out) {
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new FileReader("/proc/net/route"));
            reader.readLine(); // 表头
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.trim().split("\\s+");
                if (parts.length < 3 || !"00000000".equals(parts[1])) continue;
                long gw = Long.parseLong(parts[2], 16);
                // 文件里是小端序，要反回来
                out.add(((gw) & 0xFF) + "." + ((gw >> 8) & 0xFF)
                        + "." + ((gw >> 16) & 0xFF) + "." + ((gw >> 24) & 0xFF));
            }
        } catch (Exception ignored) {
            // 读不到就跳过，走网段扫描
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        }
    }

    /** 把一块 IP 所在网段展开成候选地址；网段过宽时只扫当前所在的 /24，避免规模爆炸。 */
    private void addRange(Set<String> out, byte[] ip, int prefix) {
        int bits = 32 - prefix;
        if (bits < 1 || bits > 24) bits = 8; // 异常前缀按最常见的家庭 /24 处理
        if (bits > 8) bits = 8;              // /16 这类超宽网段只扫当前这一段
        long size = 1L << bits;
        long network = (toLong(ip) >> bits) << bits;
        for (long i = 1; i < size; i++) {
            if (out.size() >= 600) return;
            out.add(toIp(network + i));
        }
    }

    private long toLong(byte[] ip) {
        return ((long) (ip[0] & 0xFF) << 24)
                | ((long) (ip[1] & 0xFF) << 16)
                | ((long) (ip[2] & 0xFF) << 8)
                | (long) (ip[3] & 0xFF);
    }

    private String toIp(long value) {
        return ((value >> 24) & 0xFF) + "." + ((value >> 16) & 0xFF)
                + "." + ((value >> 8) & 0xFF) + "." + (value & 0xFF);
    }

    /** 并发候选地址：先探端口，再拉一次首页确认身份；命中第一个就返回。 */
    private String scanHosts(final List<String> hosts) {
        if (hosts.isEmpty()) return null;
        final AtomicReference<String> found = new AtomicReference<String>(null);
        final AtomicInteger finished = new AtomicInteger(0);
        final CountDownLatch done = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(48, hosts.size()));
        for (final String host : hosts) {
            pool.submit(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (found.get() != null) return;
                        if (probeHost(host)) {
                            if (found.compareAndSet(null, "http://" + host + ":" + SERVER_PORT + "/")) {
                                done.countDown();
                            }
                        }
                    } finally {
                        if (finished.incrementAndGet() >= hosts.size()) done.countDown();
                    }
                }
            });
        }
        pool.shutdown();
        try {
            done.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        pool.shutdownNow();
        return found.get();
    }

    /** 判断某台主机上跑的是不是本项目的演示服务。 */
    private boolean probeHost(String host) {
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(host, SERVER_PORT), 500);
        } catch (Exception ignored) {
            return false;
        } finally {
            try {
                socket.close();
            } catch (Exception ignored) {
                // 关闭失败无所谓
            }
        }
        try {
            URL url = new URL("http://" + host + ":" + SERVER_PORT + "/");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(1000);
            conn.setReadTimeout(1500);
            conn.setRequestMethod("GET");
            conn.setInstanceFollowRedirects(true);
            if (conn.getResponseCode() != 200) return false;
            BufferedReader reader =
                    new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
            StringBuilder page = new StringBuilder();
            String line;
            for (int i = 0; i < 40 && (line = reader.readLine()) != null; i++) {
                page.append(line);
            }
            reader.close();
            return page.toString().contains(SERVICE_MARK);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** 扫描中的界面：给个明确反馈，别让用户以为卡死。 */
    private void showSearching() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(28), dp(28), dp(28));
        root.setBackgroundColor(Color.parseColor("#F4F5F8"));

        root.addView(new ProgressBar(this));

        TextView title = new TextView(this);
        title.setText("正在查找演示服务");
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(Color.parseColor("#101828"));
        title.setPadding(0, dp(18), 0, 0);
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText("正在扫描同一局域网里开了 " + SERVER_PORT + " 端口的电脑…\n\n请确认电脑上已运行 start-demo.bat，\n并且手机与电脑在同一个网络。");
        hint.setTextSize(13.5f);
        hint.setGravity(Gravity.CENTER);
        hint.setTextColor(Color.parseColor("#667085"));
        hint.setLineSpacing(dp(4), 1f);
        hint.setPadding(0, dp(10), 0, 0);
        root.addView(hint);

        setContentView(root);
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
                if (!request.isForMainFrame()) return;
                String failed = request.getUrl() == null ? "" : request.getUrl().toString();
                // 换网络、电脑 IP 变了都会让旧地址失效：先自己重找一遍，实在没有再兜底
                long now = System.currentTimeMillis();
                if (now - lastAutoScanAt > AUTO_SCAN_COOLDOWN_MS) {
                    lastAutoScanAt = now;
                    discover(true, failed);
                } else {
                    showOffline(failed, 0, true);
                }
            }
        });

        webView.loadUrl(url);
        setContentView(webView);
    }

    /** 连不上服务时的兜底页，给"重新查找/重试/改地址"三个出口。 */
    private void showOffline(String failedUrl) {
        showOffline(failedUrl, 0, false);
    }

    private void showOffline(String failedUrl, int scannedCount, boolean autoScanned) {
        awaitingReconnect = true;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(28), dp(28), dp(28));
        root.setBackgroundColor(Color.parseColor("#F4F5F8"));

        TextView title = new TextView(this);
        title.setText("没找到演示服务");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#101828"));
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView detail = new TextView(this);
        String shown = failedUrl.length() > 0 ? failedUrl : prefs().getString(KEY_URL, DEFAULT_URL);
        StringBuilder detailText = new StringBuilder("原地址：" + shown);
        if (autoScanned) {
            detailText.append(
                    scannedCount > 0
                            ? "\n\n已在局域网里找了 " + scannedCount + " 个可能地址，都没响应。"
                            : "\n\n刚自动找过一遍，没找到。");
        }
        detailText.append("\n\n请确认：\n· 电脑上的演示服务已启动（start-demo.bat）\n· 手机和电脑在同一个局域网\n· 电脑防火墙允许 "
                + SERVER_PORT + " 端口");
        detail.setText(detailText.toString());
        detail.setTextSize(14);
        detail.setTextColor(Color.parseColor("#667085"));
        detail.setLineSpacing(dp(4), 1f);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, dp(16), 0, dp(24));
        root.addView(detail);

        // 自动查找是主要出路：服务起来后点它（或切回 App）就能连上，不用手填地址
        Button rescan = new Button(this);
        rescan.setText("重新查找");
        rescan.setAllCaps(false);
        rescan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                lastAutoScanAt = System.currentTimeMillis();
                discover(false, failedUrl);
            }
        });
        LinearLayout.LayoutParams lp0 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        root.addView(rescan, lp0);

        Button retry = new Button(this);
        retry.setText("重试原地址");
        retry.setAllCaps(false);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showWeb(prefs().getString(KEY_URL, DEFAULT_URL));
            }
        });
        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp1.topMargin = dp(8);
        root.addView(retry, lp1);

        Button change = new Button(this);
        change.setText("手动填写地址");
        change.setAllCaps(false);
        change.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                awaitingReconnect = false;
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
        if (webView != null) {
            webView.onResume();
            return;
        }
        // 兜底页上退到后台、电脑那边才刚把服务起来的情况：切回来自动再找一次
        if (awaitingReconnect && !scanning && System.currentTimeMillis() - lastAutoScanAt > AUTO_SCAN_COOLDOWN_MS) {
            lastAutoScanAt = System.currentTimeMillis();
            discover(true, "");
        }
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
