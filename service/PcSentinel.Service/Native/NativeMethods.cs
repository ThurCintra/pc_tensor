using System.Runtime.InteropServices;

namespace PcSentinel.Service.Native;

/// <summary>
/// Declarações P/Invoke (source-generated via LibraryImport, sem marshalling em tempo de execução).
/// </summary>
internal static partial class NativeMethods
{
    // ntdll ------------------------------------------------------------------------------------------

    /// <summary>SYSTEM_INFORMATION_CLASS.SystemMemoryListInformation.</summary>
    public const int SystemMemoryListInformation = 80;

    /// <summary>SYSTEM_MEMORY_LIST_COMMAND.MemoryPurgeStandbyList.</summary>
    public const int MemoryPurgeStandbyList = 4;

    public const int StatusSuccess = 0;

    [LibraryImport("ntdll.dll")]
    public static partial int NtSetSystemInformation(int systemInformationClass, ref int systemInformation, int length);

    [LibraryImport("ntdll.dll")]
    public static partial int NtQuerySystemInformation(
        int systemInformationClass,
        out SystemMemoryListInformationData systemInformation,
        int length,
        out int returnLength);

    /// <summary>SYSTEM_MEMORY_LIST_INFORMATION (contagens em páginas).</summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct SystemMemoryListInformationData
    {
        public nuint ZeroPageCount;
        public nuint FreePageCount;
        public nuint ModifiedPageCount;
        public nuint ModifiedNoWritePageCount;
        public nuint BadPageCount;
        public fixed ulong PageCountByPriority[8];
        public fixed ulong RepurposedPagesByPriority[8];
        public nuint ModifiedPageCountPageFile;
    }

    // advapi32 ---------------------------------------------------------------------------------------

    public const uint TokenAdjustPrivileges = 0x0020;
    public const uint TokenQuery = 0x0008;
    public const uint SePrivilegeEnabled = 0x00000002;
    public const int ErrorNotAllAssigned = 1300;

    /// <summary>Privilégio exigido por MemoryPurgeStandbyList.</summary>
    public const string SeProfileSingleProcessPrivilege = "SeProfileSingleProcessPrivilege";

    [StructLayout(LayoutKind.Sequential)]
    public struct Luid
    {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct TokenPrivilegesSingle
    {
        public uint PrivilegeCount;
        public Luid Luid;
        public uint Attributes;
    }

    [LibraryImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool OpenProcessToken(nint processHandle, uint desiredAccess, out nint tokenHandle);

    [LibraryImport("advapi32.dll", EntryPoint = "LookupPrivilegeValueW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool LookupPrivilegeValue(string? systemName, string name, out Luid luid);

    [LibraryImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool AdjustTokenPrivileges(
        nint tokenHandle,
        [MarshalAs(UnmanagedType.Bool)] bool disableAllPrivileges,
        ref TokenPrivilegesSingle newState,
        int bufferLength,
        nint previousState,
        nint returnLength);

    // kernel32 ---------------------------------------------------------------------------------------

    [LibraryImport("kernel32.dll")]
    public static partial nint GetCurrentProcess();

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CloseHandle(nint handle);

    // user32 -----------------------------------------------------------------------------------------

    [LibraryImport("user32.dll")]
    public static partial nint GetForegroundWindow();

    [LibraryImport("user32.dll", SetLastError = true)]
    public static partial uint GetWindowThreadProcessId(nint hWnd, out uint processId);
}
