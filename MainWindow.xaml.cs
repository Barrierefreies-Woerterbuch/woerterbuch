using System.Diagnostics;
using System.ComponentModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace BarrierefreiesWoerterbuch;

public partial class MainWindow : Window
{
    private const string AppHost = "woerterbuch.local";
    private const string AppStartPage = "https://woerterbuch.local/index.html";
    private const double MinimumVisiblePixels = 80;
    private bool _initialized;
    private WindowState _lastNonMinimizedState = WindowState.Normal;

    public MainWindow()
    {
        InitializeComponent();
        RestoreWindowState();
    }

    private static string WindowStateFile => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Barrierefreies Woerterbuch",
        "window-state.json");

    private void RestoreWindowState()
    {
        try
        {
            if (!File.Exists(WindowStateFile))
            {
                return;
            }

            WindowPlacementSettings? settings = JsonSerializer.Deserialize<WindowPlacementSettings>(
                File.ReadAllText(WindowStateFile));

            if (settings is null || !IsValidWindowPlacement(settings))
            {
                return;
            }

            Width = settings.Width;
            Height = settings.Height;
            Left = settings.Left;
            Top = settings.Top;
            WindowStartupLocation = WindowStartupLocation.Manual;

            if (settings.IsMaximized)
            {
                _lastNonMinimizedState = WindowState.Maximized;
                WindowState = WindowState.Maximized;
            }
        }
        catch (Exception)
        {
            // Beschädigte oder nicht lesbare Einstellungen dürfen den Start nicht verhindern.
        }
    }

    private bool IsValidWindowPlacement(WindowPlacementSettings settings)
    {
        if (!double.IsFinite(settings.Width) ||
            !double.IsFinite(settings.Height) ||
            !double.IsFinite(settings.Left) ||
            !double.IsFinite(settings.Top) ||
            settings.Width < MinWidth ||
            settings.Height < MinHeight)
        {
            return false;
        }

        Rect savedWindow = new(
            settings.Left,
            settings.Top,
            settings.Width,
            settings.Height);
        Rect virtualScreen = new(
            SystemParameters.VirtualScreenLeft,
            SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth,
            SystemParameters.VirtualScreenHeight);
        Rect visibleArea = Rect.Intersect(savedWindow, virtualScreen);

        return !visibleArea.IsEmpty &&
               visibleArea.Width >= MinimumVisiblePixels &&
               visibleArea.Height >= MinimumVisiblePixels;
    }

    private void MainWindow_StateChanged(object? sender, EventArgs e)
    {
        if (WindowState != WindowState.Minimized)
        {
            _lastNonMinimizedState = WindowState;
        }
    }

    private void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        try
        {
            bool isMaximized = WindowState == WindowState.Maximized ||
                (WindowState == WindowState.Minimized &&
                 _lastNonMinimizedState == WindowState.Maximized);

            Rect bounds = WindowState == WindowState.Normal
                ? new Rect(Left, Top, ActualWidth, ActualHeight)
                : RestoreBounds;

            if (bounds.IsEmpty ||
                !double.IsFinite(bounds.Width) ||
                !double.IsFinite(bounds.Height) ||
                bounds.Width < MinWidth ||
                bounds.Height < MinHeight)
            {
                return;
            }

            WindowPlacementSettings settings = new(
                bounds.Left,
                bounds.Top,
                bounds.Width,
                bounds.Height,
                isMaximized);

            string? settingsDirectory = Path.GetDirectoryName(WindowStateFile);
            if (!string.IsNullOrWhiteSpace(settingsDirectory))
            {
                Directory.CreateDirectory(settingsDirectory);
            }

            File.WriteAllText(
                WindowStateFile,
                JsonSerializer.Serialize(settings, new JsonSerializerOptions
                {
                    WriteIndented = true
                }));
        }
        catch (Exception)
        {
            // Das Schließen muss auch möglich sein, wenn Einstellungen nicht gespeichert werden können.
        }
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        if (_initialized)
        {
            return;
        }

        _initialized = true;

        try
        {
            string webFolder = Path.Combine(AppContext.BaseDirectory, "web");
            string startFile = Path.Combine(webFolder, "index.html");

            if (!File.Exists(startFile))
            {
                ShowStartupError(
                    "Die lokalen Wörterbuchdateien wurden nicht gefunden.\n\n" +
                    "Bitte den vollständigen Programmordner erneut entpacken und die EXE dort starten.");
                return;
            }

            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();

            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Barrierefreies Woerterbuch",
                "WebView2");

            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder);

            await DictionaryView.EnsureCoreWebView2Async(environment);

            CoreWebView2Settings settings = DictionaryView.CoreWebView2.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = true;
            settings.IsZoomControlEnabled = true;

            DictionaryView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                AppHost,
                webFolder,
                CoreWebView2HostResourceAccessKind.DenyCors);

            DictionaryView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
            DictionaryView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;
            DictionaryView.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;
            DictionaryView.CoreWebView2.PermissionRequested += CoreWebView2_PermissionRequested;

            DictionaryView.CoreWebView2.Navigate(AppStartPage);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowStartupError(
                "Die Microsoft Edge WebView2-Laufzeit fehlt.\n\n" +
                "Sie gehört zu Windows 11 und ist auf den meisten Windows-10-PCs bereits vorhanden. " +
                "Bitte Windows beziehungsweise Microsoft Edge aktualisieren und das Wörterbuch danach erneut starten.");
        }
        catch (Exception exception)
        {
            ShowStartupError(
                "Das Wörterbuch konnte nicht gestartet werden.\n\n" +
                exception.Message);
        }
    }

    private async void CoreWebView2_NavigationCompleted(
        object? sender,
        CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            ShowStartupError(
                "Die lokale Wörterbuchoberfläche konnte nicht geladen werden.\n\n" +
                $"Fehler: {e.WebErrorStatus}");
            return;
        }

        DictionaryView.Focus();
        await DictionaryView.CoreWebView2.ExecuteScriptAsync(
            "document.getElementById('query')?.focus();");
    }

    private void CoreWebView2_NavigationStarting(
        object? sender,
        CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? uri))
        {
            e.Cancel = true;
            return;
        }

        if (uri.Scheme == Uri.UriSchemeHttps &&
            uri.Host.Equals(AppHost, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        e.Cancel = true;
        if (e.IsUserInitiated)
        {
            OpenExternalLink(uri);
        }
    }

    private void CoreWebView2_NewWindowRequested(
        object? sender,
        CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? uri))
        {
            OpenExternalLink(uri);
        }
    }

    private static void CoreWebView2_PermissionRequested(
        object? sender,
        CoreWebView2PermissionRequestedEventArgs e)
    {
        e.State = CoreWebView2PermissionState.Deny;
    }

    private static void OpenExternalLink(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri)
            {
                UseShellExecute = true
            });
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                "Der Quellenlink konnte nicht im Standardbrowser geöffnet werden.\n\n" +
                exception.Message,
                "Barrierefreies Wörterbuch",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void ShowStartupError(string message)
    {
        MessageBox.Show(
            this,
            message,
            "Barrierefreies Wörterbuch",
            MessageBoxButton.OK,
            MessageBoxImage.Error);
        Close();
    }

    private sealed record WindowPlacementSettings(
        double Left,
        double Top,
        double Width,
        double Height,
        bool IsMaximized);
}
