namespace Engine;

internal class SettingsReader(Stream stream) : IDisposable
{
	private StreamReader _reader = new StreamReader(stream ?? throw new ArgumentNullException(nameof(stream)));
	private Dictionary<string, string> _settings = [];
	private bool _disposed = false;

	public Dictionary<string, string> ReadSettings()
	{
		ObjectDisposedException.ThrowIf(_disposed, this);

		int lineIndex = 0;
		string lineData;

		while (!_reader.EndOfStream)
		{
			lineData = _reader.ReadLine()!.Trim();

			if (lineData.StartsWith(';'))
				continue;

			string[] parts = lineData.Split('=', 2);

			if (parts.Length != 2)
			{
				if (_reader.BaseStream is FileStream fileStream)
				{
					string fileStreamFilePath = fileStream.Name;

					throw new Exception($"Invalid data in File {fileStreamFilePath} at Line {lineIndex}");
				}
				
				throw new Exception($"Invalid data at Line {lineIndex}!");
			}

			_settings[parts[0].Trim()] = parts[1].Trim();

			lineIndex++;
		}

		return _settings;
	}

	public void Dispose()
	{
		if (!_disposed)
		{
			_reader.Dispose();
			_disposed = true;
		}
	}
}