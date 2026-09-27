using System.Windows;
using System.Threading;

namespace BarrierefreiesWoerterbuch;

public partial class App : Application
{
    private Mutex? _singleInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _singleInstanceMutex = new Mutex(
            initiallyOwned: true,
            name: @"Local\BarrierefreiesWoerterbuch_AlessandroFabiano",
            createdNew: out bool isFirstInstance);

        if (!isFirstInstance)
        {
            MessageBox.Show(
                "Das Barrierefreie Wörterbuch ist bereits geöffnet.",
                "Barrierefreies Wörterbuch",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        MainWindow window = new();
        MainWindow = window;
        window.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
