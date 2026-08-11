package cn.zhixing.classroom;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
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
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final String PREFS = "zhixing_student";
    private static final String SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER = "http://192.168.137.1:4173";
    private static final int FILE_CHOOSER_REQUEST = 4107;

    private WebView webView;
    private ProgressBar progressBar;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;
    private boolean errorDialogVisible;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(23, 63, 58));
        getWindow().setNavigationBarColor(Color.rgb(245, 246, 242));
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        setContentView(createContentView());
        configureWebView();
        openClassroom();
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(245, 246, 242));
        root.setFitsSystemWindows(true);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(18), 0, dp(12), 0);
        toolbar.setBackgroundColor(Color.rgb(23, 63, 58));
        root.addView(toolbar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)));

        TextView title = new TextView(this);
        title.setText(R.string.toolbar_title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button settingsButton = new Button(this);
        settingsButton.setText(R.string.connection_settings);
        settingsButton.setTextColor(Color.WHITE);
        settingsButton.setTextSize(13);
        settingsButton.setAllCaps(false);
        settingsButton.setPadding(dp(14), 0, dp(14), 0);
        settingsButton.setBackground(roundedBackground(Color.rgb(40, 95, 86), 18));
        settingsButton.setOnClickListener(view -> showServerDialog());
        toolbar.addView(settingsButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(38)));

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        webView = new WebView(this);
        content.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        content.addView(progressBar, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));
        return root;
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
        settings.setUserAgentString(settings.getUserAgentString() + " ZhixingStudentApp/0.1");

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
        progressBar.setVisibility(View.VISIBLE);
        webView.loadUrl(classroomUrl(preferences.getString(SERVER_URL, DEFAULT_SERVER)));
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
        input.setText(preferences.getString(SERVER_URL, DEFAULT_SERVER));
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
                    openClassroom();
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void showConnectionError() {
        progressBar.setVisibility(View.GONE);
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

    private GradientDrawable roundedBackground(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        webView.destroy();
        super.onDestroy();
    }
}
