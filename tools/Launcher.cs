using System;
using System.Diagnostics;
using System.IO;
internal static class Launcher {
    private static int Main(string[] args) {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        if (args.Length == 1 && args[0] == "--check") return File.Exists(Path.Combine(root, "cli.mjs")) ? 0 : 1;
        try {
            Console.Title = "browser-recorder";
            var start = new ProcessStartInfo("node");
            start.Arguments = "\"" + Path.Combine(root, "cli.mjs") + "\" record https://example.com --headed";
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            using (var process = Process.Start(start)) { process.WaitForExit(); return process.ExitCode; }
        } catch (Exception error) {
            Console.Error.WriteLine(error.Message);
            Console.Error.WriteLine("Install Node.js and the project dependencies, then try again.");
            Console.ReadLine(); return 1;
        }
    }
}
