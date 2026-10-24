using System.Runtime.InteropServices;
using System.Security.Principal;
using static PcSentinel.Service.Native.NativeMethods;

namespace PcSentinel.Service.Native;

/// <summary>Operações de memória do Windows que exigem privilégios (lista standby).</summary>
public static class WindowsMemory
{
    public static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    /// <summary>Tamanho atual da lista standby em MB, ou null se a consulta falhar (sem privilégio).</summary>
    public static unsafe double? GetStandbyMb()
    {
        int status = NtQuerySystemInformation(
            SystemMemoryListInformation,
            out SystemMemoryListInformationData info,
            Marshal.SizeOf<SystemMemoryListInformationData>(),
            out _);
        if (status != StatusSuccess) return null;

        ulong pages = 0;
        for (int i = 0; i < 8; i++) pages += info.PageCountByPriority[i];
        return pages * (ulong)Environment.SystemPageSize / (1024.0 * 1024.0);
    }

    /// <summary>
    /// Esvazia a lista standby (cache de arquivos já liberado pelos processos), como o RAMMap faz.
    /// Requer administrador e o privilégio SeProfileSingleProcessPrivilege, habilitado aqui no token.
    /// </summary>
    /// <returns>NTSTATUS da operação (0 = sucesso).</returns>
    public static int PurgeStandbyList()
    {
        EnablePrivilege(SeProfileSingleProcessPrivilege);
        int command = MemoryPurgeStandbyList;
        return NtSetSystemInformation(SystemMemoryListInformation, ref command, sizeof(int));
    }

    private static void EnablePrivilege(string privilege)
    {
        if (!OpenProcessToken(GetCurrentProcess(), TokenAdjustPrivileges | TokenQuery, out nint token))
        {
            throw new InvalidOperationException($"OpenProcessToken falhou (Win32 {Marshal.GetLastPInvokeError()}).");
        }

        try
        {
            if (!LookupPrivilegeValue(null, privilege, out Luid luid))
            {
                throw new InvalidOperationException($"LookupPrivilegeValue falhou (Win32 {Marshal.GetLastPInvokeError()}).");
            }

            var state = new TokenPrivilegesSingle { PrivilegeCount = 1, Luid = luid, Attributes = SePrivilegeEnabled };
            bool ok = AdjustTokenPrivileges(token, false, ref state, Marshal.SizeOf<TokenPrivilegesSingle>(), 0, 0);
            int error = Marshal.GetLastPInvokeError();

            // AdjustTokenPrivileges devolve true mesmo quando o token não tem o privilégio
            if (!ok || error == ErrorNotAllAssigned)
            {
                throw new UnauthorizedAccessException($"Privilégio {privilege} indisponível: rode o PC Sentinel como administrador.");
            }
        }
        finally
        {
            CloseHandle(token);
        }
    }
}
