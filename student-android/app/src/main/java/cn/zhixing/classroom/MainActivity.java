package cn.zhixing.classroom;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.DhcpInfo;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.provider.MediaStore;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.content.FileProvider;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import java.io.File;
import java.io.IOException;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String PREFS = "zhixing_student";
    private static final String SERVER_URL = "server_url_v2";
    private static final String CLASSROOM_URL = "classroom_url_v2";
    private static final String DEFAULT_SERVER = "http://192.168.137.1:4173";
    private static final int FILE_CHOOSER_REQUEST = 4107;

    private WebView webView;
    private ProgressBar progressBar;
    private View landingView;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;
    private boolean errorDialogVisible;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(31, 35, 40));
        getWindow().setNavigationBarColor(Color.rgb(246, 248, 250));
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        setContentView(createContentView());
        configureWebView();
    }

    private View createContentView() {
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(Color.rgb(246, 248, 250));
        content.setFitsSystemWindows(true);

        webView = new WebView(this);
        webView.setVisibility(View.GONE);
        content.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        landingView = createLandingView();
        content.addView(landingView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        content.addView(progressBar, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(3), android.view.Gravity.TOP));
        return content;
    }

    private View createLandingView() {
        LinearLayout landing = new LinearLayout(this);
        landing.setOrientation(LinearLayout.VERTICAL);
        landing.setGravity(Gravity.CENTER_HORIZONTAL);
        landing.setPadding(dp(28), dp(72), dp(28), dp(28));
        landing.setBackgroundColor(Color.rgb(246, 248, 250));

        TextView brand = new TextView(this);
        brand.setText(R.string.toolbar_title);
        brand.setTextSize(16);
        brand.setTextColor(Color.rgb(31, 35, 40));
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        landing.addView(brand);

        TextView title = new TextView(this);
        title.setText(R.string.scan_title);
        title.setTextSize(28);
        title.setTextColor(Color.rgb(31, 35, 40));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(64);
        landing.addView(title, titleParams);

        TextView hint = new TextView(this);
        hint.setText(R.string.scan_hint);
        hint.setTextSize(14);
        hint.setTextColor(Color.rgb(87, 96, 106));
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(12);
        hintParams.bottomMargin = dp(30);
        landing.addView(hint, hintParams);

        Button scan = new Button(this);
        scan.setText(R.string.scan_classroom);
        scan.setAllCaps(false);
        scan.setTextSize(16);
        scan.setOnClickListener(view -> scanClassroomQr());
        landing.addView(scan, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

        if (preferences.contains(CLASSROOM_URL)) {
            Button recent = new Button(this);
            recent.setText(R.string.open_recent_classroom);
            recent.setAllCaps(false);
            recent.setTextSize(14);
            recent.setOnClickListener(view -> openClassroom(preferences.getString(CLASSROOM_URL, "")));
            LinearLayout.LayoutParams recentParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48));
            recentParams.topMargin = dp(10);
            landing.addView(recent, recentParams);
        }

        Button manual = new Button(this);
        manual.setText(R.string.manual_connection);
        manual.setAllCaps(false);
        manual.setTextSize(13);
        manual.setOnClickListener(view -> showServerDialog());
        LinearLayout.LayoutParams manualParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44));
        manualParams.topMargin = dp(18);
        landing.addView(manual, manualParams);
        return landing;
    }

    private void scanClassroomQr() {
        new IntentIntegrator(this)
                .setPrompt(getString(R.string.scan_prompt))
                .setBeepEnabled(false)
                .setOrientationLocked(true)
                .initiateScan();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ZhixingStudentApp/0.2");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showConnectionError();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                cameraOutputUri = createCameraUri();

                Intent contentIntent;
                try { contentIntent = params.createIntent(); }
                catch (Exception exception) { contentIntent = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*"); }

                Intent chooser = Intent.createChooser(contentIntent, "选择或拍摄答案图片");
                if (cameraOutputUri != null) {
                    Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                    cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cameraIntent});
                }
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException exception) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    private Uri createCameraUri() {
        try {
            File file = File.createTempFile("answer-", ".jpg", getExternalCacheDir());
            return FileProvider.getUriForFile(this, getPackageName() + ".files", file);
        } catch (IOException | IllegalArgumentException exception) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        IntentResult scanResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scanResult != null) {
            if (scanResult.getContents() != null) {
                String classroomLink = normalizeScannedUrl(scanResult.getContents());
                if (classroomLink == null) {
                    new AlertDialog.Builder(this).setTitle(R.string.invalid_qr).setMessage(R.string.invalid_qr_detail).setPositiveButton(R.string.retry, null).show();
                } else {
                    preferences.edit().putString(CLASSROOM_URL, classroomLink).apply();
                    openClassroom(classroomLink);
                }
            }
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (cameraOutputUri != null) result = new Uri[]{cameraOutputUri};
            } else {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraOutputUri = null;
    }

    private void openClassroom() {
        String server = preferences.contains(SERVER_URL) ? preferences.getString(SERVER_URL, gatewayServer()) : gatewayServer();
        openClassroom(classroomUrl(server));
    }

    private void openClassroom(String url) {
        progressBar.setVisibility(View.VISIBLE);
        landingView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private String normalizeScannedUrl(String value) {
        try {
            Uri uri = Uri.parse(value.trim());
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) return null;
            if (!"/join".equals(uri.getPath())) return null;
            return uri.toString();
        } catch (Exception exception) {
            return null;
        }
    }

    private String gatewayServer() {
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        DhcpInfo dhcpInfo = wifiManager == null ? null : wifiManager.getDhcpInfo();
        if (dhcpInfo == null || dhcpInfo.gateway == 0) return DEFAULT_SERVER;
        int gateway = dhcpInfo.gateway;
        return String.format(Locale.US, "http://%d.%d.%d.%d:4173",
                gateway & 0xff,
                (gateway >> 8) & 0xff,
                (gateway >> 16) & 0xff,
                (gateway >> 24) & 0xff);
    }

    private String classroomUrl(String value) {
        String normalized = value == null ? DEFAULT_SERVER : value.trim();
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) normalized = "http://" + normalized;
        while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        return normalized.endsWith("/join") ? normalized : normalized + "/join";
    }

    private void showServerDialog() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint(R.string.teacher_address_hint);
        input.setText(preferences.getString(SERVER_URL, gatewayServer()));
        input.setSelectAllOnFocus(true);
        int spacing = dp(22);
        FrameLayout wrapper = new FrameLayout(this);
        wrapper.setPadding(spacing, dp(8), spacing, 0);
        wrapper.addView(input, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));

        new AlertDialog.Builder(this)
                .setTitle(R.string.teacher_address)
                .setView(wrapper)
                .setPositiveButton(R.string.save_and_connect, (dialog, which) -> {
                    String normalized = classroomUrl(input.getText().toString()).replaceFirst("/join$", "");
                    preferences.edit().putString(SERVER_URL, normalized).apply();
                    preferences.edit().remove(CLASSROOM_URL).apply();
                    openClassroom();
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void showConnectionError() {
        progressBar.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        landingView.setVisibility(View.VISIBLE);
        if (errorDialogVisible || isFinishing()) return;
        errorDialogVisible = true;
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.connection_failed)
                .setMessage(R.string.connection_failed_detail)
                .setPositiveButton(R.string.retry, (clickedDialog, which) -> openClassroom())
                .setNeutralButton(R.string.connection_settings, (clickedDialog, which) -> showServerDialog())
                .create();
        dialog.setOnDismissListener(ignored -> errorDialogVisible = false);
        dialog.show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
        } else if (webView.getVisibility() == View.VISIBLE) {
            webView.stopLoading();
            webView.setVisibility(View.GONE);
            landingView.setVisibility(View.VISIBLE);
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        webView.destroy();
        super.onDestroy();
    }
}
