# Componentes de terceiros

A ponte de sensores (`pc-sensor-bridge.exe`, código em `native/sensor-bridge/`) usa as bibliotecas abaixo,
distribuídas sem modificação nesta pasta.

| Componente | Licença | Código-fonte |
|---|---|---|
| LibreHardwareMonitorLib 0.9.6 | MPL-2.0 ([LICENSE-MPL-2.0.txt](LICENSE-MPL-2.0.txt)) | https://github.com/LibreHardwareMonitor/LibreHardwareMonitor |
| HidSharp | Apache-2.0 | https://www.zer7.com/software/hidsharp |
| DiskInfoToolkit, RAMSPDToolkit-NDD, BlackSharp.Core | conforme o projeto de origem | dependências do LibreHardwareMonitorLib (veja o repositório acima) |
| System.\* e Microsoft.Bcl.\* (pacotes NuGet do .NET) | MIT | https://github.com/dotnet/runtime |
