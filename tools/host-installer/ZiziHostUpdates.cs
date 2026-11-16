using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class HostUpdates
{
    const string Feed = "https://raw.githubusercontent.com/ljmath-glitch/science-qbank/main/downloads/host-update.json";
    const string Package = "https://raw.githubusercontent.com/ljmath-glitch/science-qbank/main/downloads/zizi-host-windows.zip";
    static readonly string Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZiziHost");
    public class Release { public string version {get;set;} public string sha256 {get;set;} public string notes {get;set;} public string modelVersion {get;set;} }
    public class Installed { public string version {get;set;} public string path {get;set;} public string modelVersion {get;set;} }
    static T Read<T>(string text) { return new JavaScriptSerializer().Deserialize<T>(text); }
    public static bool IsNew(Release release, string current)
    {
        Version remote, local;
        return release != null && Version.TryParse(release.version, out remote) && Version.TryParse(current, out local) &&
            remote > local && release.sha256 != null && System.Text.RegularExpressions.Regex.IsMatch(release.sha256, "\\A[0-9a-fA-F]{64}\\z");
    }
    public static string Hash(byte[] data)
    {
        using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
    }
    public static string EntryPath(string folder, string entry)
    {
        string root = Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string path = Path.GetFullPath(Path.Combine(root, entry));
        if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("更新壓縮檔路徑不正確。");
        return path;
    }
    public static int SelfTest()
    {
        var parsed = Read<Release>("{\"version\":\"2.1.0\",\"modelVersion\":\"new-model\",\"sha256\":\"" + new string('a',64) + "\"}");
        if (parsed.modelVersion != "new-model" || !IsNew(parsed,"2.0.0")) return 6;
        if (!IsNew(new Release { version = "2.1.0", sha256 = new string('a',64) }, "2.0.0")) return 1;
        if (IsNew(new Release { version = "2.0.0", sha256 = new string('a',64) }, "2.0.0")) return 2;
        if (IsNew(new Release { version = "2.1.0", sha256 = "bad" }, "2.0.0")) return 3;
        if (Hash(new byte[0]) != "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") return 4;
        try { EntryPath(Path.GetTempPath(), "../outside"); return 5; } catch (InvalidDataException) {}
        return 0;
    }
    public static int Run()
    {
        bool created;
        using (var mutex = new System.Threading.Mutex(true, "Local\\ZiziHostUpdates", out created))
        {
            if (!created) return 0;
            Application.EnableVisualStyles();
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            var context = new ApplicationContext();
            var tray = new NotifyIcon { Icon = SystemIcons.Information, Visible = true, Text = "茲茲主機更新" };
            var menu = new ContextMenuStrip();
            var check = menu.Items.Add("檢查更新");
            tray.ContextMenuStrip = menu;
            bool busy = false;
            string notified = null;
            Release available = null;
            Func<bool, Task> checkUpdate = async manual => {
                if (busy) return;
                busy = true;
                try {
                    var installed = Read<Installed>(File.ReadAllText(Path.Combine(Home, "installed.json")));
                    using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) })
                    {
                        http.DefaultRequestHeaders.UserAgent.ParseAdd("ZiziHost-Updater/2.0");
                        var release = Read<Release>(await http.GetStringAsync(Feed));
                        if (IsNew(release, installed.version)) {
                            available = release;
                            check.Text = "更新到 " + release.version;
                            if (manual || notified != release.version) {
                                notified = release.version;
                                tray.ShowBalloonTip(15000, "茲茲主機有更新", "版本 " + release.version + " · 模型 " + release.modelVersion + "\n點此更新。請先完成正在處理的考卷。", ToolTipIcon.Info);
                            }
                        } else {
                            available = null; check.Text = "檢查更新";
                            if (manual) MessageBox.Show("目前已是最新版本。", "茲茲主機更新");
                        }
                    }
                } catch (Exception ex) {
                    if (manual) MessageBox.Show("檢查更新失敗：" + ex.Message + "\n稍後可再試。", "茲茲主機更新");
                } finally { busy = false; }
            };
            Func<Task> update = async () => {
                if (busy || available == null) return;
                busy = true;
                try {
                    Release release = available;
                    tray.Text = "茲茲主機：正在下載更新";
                    byte[] bytes;
                    using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(15) }) {
                        http.DefaultRequestHeaders.UserAgent.ParseAdd("ZiziHost-Updater/2.0");
                        bytes = await http.GetByteArrayAsync(Package);
                    }
                    if (!String.Equals(Hash(bytes), release.sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("更新檔校驗不符，請稍後再試。");
                    string stage = Path.Combine(Home, "updates", Guid.NewGuid().ToString("N"));
                    Directory.CreateDirectory(stage);
                    using (var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read)) {
                        foreach (var item in zip.Entries) {
                            string path = EntryPath(stage, item.FullName);
                            if (String.IsNullOrEmpty(item.Name)) { Directory.CreateDirectory(path); continue; }
                            Directory.CreateDirectory(Path.GetDirectoryName(path));
                            item.ExtractToFile(path);
                        }
                    }
                    string exe = Path.Combine(stage, "茲茲主機安裝", "茲茲主機安裝.exe");
                    if (!File.Exists(exe)) throw new InvalidDataException("更新包缺少安裝程式。");
                    using (var installer = Process.Start(new ProcessStartInfo(exe, "--update") { UseShellExecute = true })) {
                        tray.ShowBalloonTip(4000, "正在更新", "更新視窗已開啟，完成後會自動重啟主機。", ToolTipIcon.Info);
                        await Task.Run(() => installer.WaitForExit());
                    }
                    var state = Read<Installed>(File.ReadAllText(Path.Combine(Home,"installed.json")));
                    if (state.version == release.version) context.ExitThread();
                } catch (Exception ex) { MessageBox.Show("更新未完成：" + ex.Message + "\n原有主機仍可使用，可再次按更新重試。", "茲茲主機更新"); }
                finally { busy = false; tray.Text = "茲茲主機更新"; }
            };
            check.Click += async (s,e) => { if (available == null) await checkUpdate(true); else await update(); };
            tray.BalloonTipClicked += async (s,e) => await update();
            var timer = new Timer { Interval = 30 * 60 * 1000 };
            timer.Tick += async (s,e) => await checkUpdate(false);
            timer.Start();
            // Start the first asynchronous check after the UI message loop starts.
            var initial = new Timer { Interval = 15000 };
            initial.Tick += async (s,e) => { initial.Stop(); await checkUpdate(false); };
            initial.Start();
            Application.Run(context);
            timer.Dispose(); initial.Dispose(); tray.Dispose();
            return 0;
        }
    }
}
