namespace PcSentinel.Service.Context;

/// <summary>
/// Só troca de perfil quando o novo se mantém por <c>holdS</c> segundos seguidos. O perfil muda o layout do Pit Wall
/// (no app, no celular e na nuvem); sem essa espera, um Alt+Tab rápido ou um pico de GPU de meio segundo mexia
/// todos os cards de lugar.
/// </summary>
public sealed class ProfileStabilizer(double holdS = 3)
{
    private string? _current;
    private string? _candidate;
    private double _candidateSince;

    public string Update(string observed, double timestampS)
    {
        if (_current is null || observed == _current)
        {
            _current ??= observed; // a primeira leitura vale na hora
            _candidate = null;
            return _current;
        }

        if (observed != _candidate)
        {
            _candidate = observed;
            _candidateSince = timestampS;
        }
        else if (timestampS - _candidateSince >= holdS)
        {
            _current = observed;
            _candidate = null;
        }
        return _current;
    }
}
