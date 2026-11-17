using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class Installer : Form
{
    readonly Button install = new Button();
    readonly Label status = new Label();
    readonly TextBox log = new TextBox();
    readonly ProgressBar progress = new ProgressBar();
    readonly TextBox hostName = new TextBox();
    bool running;
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--updates") return HostUpdates.Run();
        if (args.Length == 1 && args[0] == "--test-updates") return HostUpdates.SelfTest();
        if (args.Length == 1 && args[0] == "--test-online") return HostUpdates.OnlineTest();
        if (args.Length == 1 && args[0] == "--check-package")
        {
            string folder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "internal");
            string payload = Path.Combine(folder,"詳解應用");
            return File.Exists(Path.Combine(folder, "install.ps1")) &&
                File.Exists(Path.Combine(payload, "local-app", "install-host-service.ps1")) &&
                File.Exists(Path.Combine(payload,"ocr","figcrop","crop.py")) &&
                File.Exists(Path.Combine(payload,"exam-to-word","scripts","buildlib.py")) &&
                File.Exists(Path.Combine(payload,"exam-to-word","assets","template.docx")) ? 0 : 1;
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Installer(args.Length == 1 && args[0] == "--update"));
        return 0;
    }

    Installer(bool update)
    {
        Text = "茲茲主機安裝";
        ClientSize = new Size(720, 590);
        MinimumSize = new Size(736, 629);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft JhengHei", 10);
        BackColor = Color.FromArgb(248, 247, 244);
        var title = new Label { Text = "茲茲主機安裝", Location = new Point(24, 20), AutoSize = true, Font = new Font(Font.FontFamily, 21, FontStyle.Bold), ForeColor = Color.FromArgb(133, 1, 3) };
        var intro = new Label { Text = "按下開始，準備 OCR、題庫 Excel 與背景服務。\n首次安裝需要網路，可能花數分鐘。安裝確認與帳號登入請依提示完成。", Location = new Point(26, 75), Size = new Size(665, 55) };
        install.Text = "開始安裝";
        var nameLabel = new Label { Text = "主機顯示名稱", Location = new Point(26, 140), AutoSize = true };
        hostName.SetBounds(154, 136, 290, 30);
        hostName.MaxLength = 20;
        hostName.Text = SavedName();
        var nameHint = new Label { Text = "例如：天母、玉承、劍潭。這個名稱會顯示在網站主機選單。", Location = new Point(26, 175), Size = new Size(665, 24) };
        install.SetBounds(26, 209, 156, 44);
        install.BackColor = Color.FromArgb(133, 1, 3);
        install.ForeColor = Color.White;
        install.FlatStyle = FlatStyle.Flat;
        install.Click += async (sender, e) => {
            string name = hostName.Text.Trim();
            if (name.Length == 0 || name.IndexOf('"') >= 0) { MessageBox.Show(this, "請填寫主機顯示名稱，並避免使用雙引號。", "主機名稱"); hostName.Focus(); return; }
            bool completed = false;
            running = true;
            install.Enabled = false;
            hostName.Enabled = false;
            progress.Style = ProgressBarStyle.Marquee;
            status.Text = "安裝中，請保持此視窗開啟…";
            log.Clear();
            try
            {
                string script = Path.Combine(root, "internal", "install.ps1");
                if (!File.Exists(script)) throw new FileNotFoundException("找不到 internal 安裝檔，請重新解壓縮完整安裝包。");
                var info = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
                info.WorkingDirectory = Path.GetDirectoryName(script);
                info.UseShellExecute = false;
                if (!update) info.EnvironmentVariables["ZIZI_HOST_DISPLAY_NAME"] = name;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                info.StandardOutputEncoding = Encoding.UTF8;
                info.StandardErrorEncoding = Encoding.UTF8;
                using (var process = new Process { StartInfo = info })
                {
                    process.OutputDataReceived += (s, line) => Append(line.Data);
                    process.ErrorDataReceived += (s, line) => Append(line.Data);
                    process.Start();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();
                    await System.Threading.Tasks.Task.Run(() => process.WaitForExit());
                    if (process.ExitCode != 0) throw new Exception("安裝未完成，請查看下方紀錄。修正後可再按一次開始安裝。");
                }
                status.Text = "安裝完成，OCR 主機連線檢查通過。";
                completed = true;
                if (!update) MessageBox.Show(this, "主機已安裝。請確認 Tailscale 與 AI 工具已登入。\n回到匯卷頁選擇這台主機，再按測試連線。", "安裝完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception error) { status.Text = "安裝未完成"; Append(error.Message); }
            finally { running = false; install.Enabled = true; hostName.Enabled = true; progress.Style = ProgressBarStyle.Blocks; if (update && completed) Close(); }
        };
        status.SetBounds(198, 218, 490, 35);
        status.Text = "準備就緒";
        progress.SetBounds(26, 266, 665, 8);
        progress.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        log.SetBounds(26, 290, 665, 272);
        log.Multiline = true;
        log.ReadOnly = true;
        log.ScrollBars = ScrollBars.Both;
        log.WordWrap = false;
        log.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        Controls.AddRange(new Control[] {title, intro, nameLabel, hostName, nameHint, install, status, progress, log});
        if (update) { Text = "茲茲主機更新"; install.Text = "更新中"; Shown += (s, e) => install.PerformClick(); }
        FormClosing += (s, e) => { if (running) { e.Cancel = true; MessageBox.Show(this, "安裝進行中，請等待完成後再關閉。", "正在安裝"); } };
    }

    static string SavedName()
    {
        try {
            string state = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZiziHost", "installed.json");
            var serializer = new JavaScriptSerializer();
            var installed = serializer.Deserialize<HostUpdates.Installed>(File.ReadAllText(state));
            var config = serializer.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(installed.path,"local-app","host-config.json")));
            object name;
            if (config.TryGetValue("displayName",out name) && !String.IsNullOrWhiteSpace(Convert.ToString(name))) return Convert.ToString(name);
        } catch {}
        return Environment.MachineName;
    }

    void Append(string message)
    {
        if (message == null || IsDisposed) return;
        if (InvokeRequired) { BeginInvoke(new Action<string>(Append), message); return; }
        log.AppendText(message + Environment.NewLine);
    }
}
