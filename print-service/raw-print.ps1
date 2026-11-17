# Sends a receipt's printer commands (ESC/POS bytes) to a Windows printer as a RAW print
# job, so the printer's driver passes them through untouched. Called by windowsPrinter.js:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File raw-print.ps1 -PrinterName "POS-58" -Path receipt.bin
#
# -CheckOnly checks the printer (it exists and isn't offline) and prepares the printing code,
# without printing anything; the print service runs it when it starts.
#
# Exit codes: 0 sent to the printer's queue, 2 no printer with that name, 3 Windows reports
# the printer offline, 1 anything else. The reason goes to stderr.
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [string]$Path,
  [string]$DocName = "Zak's Sizzling Hub receipt",
  [switch]$CheckOnly
)
$ErrorActionPreference = "Stop"

try {
  $printers = @(Get-CimInstance -ClassName Win32_Printer)
  $printer = $printers | Where-Object { $_.Name -eq $PrinterName } | Select-Object -First 1
  if (-not $printer) {
    $names = ($printers | ForEach-Object { $_.Name }) -join ", "
    [Console]::Error.WriteLine("Windows has no printer named '$PrinterName'. Printers on this computer: $names")
    exit 2
  }
  # WorkOffline: "Use printer offline" is ticked, or Windows lost the printer. 7 = Offline.
  if ($printer.WorkOffline -or $printer.PrinterStatus -eq 7) {
    [Console]::Error.WriteLine("Windows reports the printer '$PrinterName' as offline. Check that it is switched on and its USB cable is plugged in.")
    exit 3
  }

  $source = @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class ZaksRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DocInfo {
        public string pDocName;
        public string pOutputFile;
        public string pDatatype;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern int StartDocPrinter(IntPtr handle, int level, [In] DocInfo info);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);

    static Win32Exception Fail(string what) {
        return new Win32Exception(Marshal.GetLastWin32Error(), what);
    }

    public static void Send(string printer, string docName, byte[] data) {
        IntPtr handle;
        if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw Fail("Couldn't open the printer");
        try {
            DocInfo info = new DocInfo();
            info.pDocName = docName;
            info.pDatatype = "RAW";
            if (StartDocPrinter(handle, 1, info) == 0) throw Fail("Couldn't start the print job");
            try {
                if (!StartPagePrinter(handle)) throw Fail("Couldn't start the page");
                int written;
                bool ok = WritePrinter(handle, data, data.Length, out written);
                EndPagePrinter(handle);
                if (!ok) throw Fail("Couldn't send the receipt to the printer");
                if (written != data.Length) throw new Exception("The printer took only " + written + " of " + data.Length + " bytes");
            } finally {
                EndDocPrinter(handle);
            }
        } finally {
            ClosePrinter(handle);
        }
    }
}
"@
  # Compiling the C# above takes a second or two, so it is compiled once and kept in TEMP;
  # the name carries a hash of the source, so a changed script compiles afresh.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $hash = -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($source))[0..5] | ForEach-Object { $_.ToString("x2") })
  $dll = Join-Path $env:TEMP "ZaksRawPrinter-$hash.dll"
  if (-not (Test-Path $dll)) {
    $tmp = Join-Path $env:TEMP ("ZaksRawPrinter-" + [guid]::NewGuid() + ".dll")
    Add-Type -TypeDefinition $source -OutputAssembly $tmp
    Move-Item -Force $tmp $dll
  }
  Add-Type -Path $dll

  if ($CheckOnly) {
    Write-Output "ok: '$PrinterName' on port $($printer.PortName), driver $($printer.DriverName)"
    exit 0
  }
  if (-not $Path) { throw "-Path is required" }

  [ZaksRawPrinter]::Send($PrinterName, $DocName, [System.IO.File]::ReadAllBytes($Path))
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($_.Exception.InnerException) { $message = $_.Exception.InnerException.Message }
  [Console]::Error.WriteLine("Printing on '$PrinterName' failed: $message")
  exit 1
}
