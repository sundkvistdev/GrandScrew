namespace Engine;

internal static class SettingsManager
{
	private const string OverrideConfigFileName = "OVERRIDECONFIG.ini";

	private static readonly string ExecutableDirectoryPath = AppDomain.CurrentDomain.BaseDirectory;
	private static readonly string DataDirectoryPath =
		Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), ProgramConstants.ProductName);
	private static readonly string OverrideConfigurationFilePath =
		Path.Combine(ExecutableDirectoryPath, OverrideConfigFileName);
	private static readonly string DefaultSettingsFilePath =
		Path.Combine(DataDirectoryPath, "Config.ini");

	private static string _settingsFilePath;
	private static Dictionary<string, string>? _settings;

	static SettingsManager()
	{
		_settingsFilePath = DefaultSettingsFilePath;
		_settings = null;
	}

	public static void LoadSettings()
	{
		Console.WriteLine("Checking override configuration file existence...");

		if (File.Exists(OverrideConfigurationFilePath))
		{
			Console.WriteLine("Reading override configuration file...");

			Dictionary<string, string> overrideConfig = new SettingsReader(File.OpenRead(OverrideConfigurationFilePath)).ReadSettings();

			if (overrideConfig.TryGetValue("configPath", out string? configPath) && configPath != null)
			{
				_settingsFilePath = configPath;

				Console.WriteLine($"Override settings file path set to '{configPath}'");
			}
		}

		Stream settingsStream;

		if (!File.Exists(_settingsFilePath))
		{
			Directory.CreateDirectory(Path.GetDirectoryName(_settingsFilePath) ?? throw new Exception("Unexpected issue or invalid path"));
			settingsStream = File.Create(_settingsFilePath);
		}
		else
		{
			settingsStream = File.OpenRead(_settingsFilePath);
		}

		_settings = new SettingsReader(settingsStream).ReadSettings();

		Console.WriteLine("Settings loaded");
	}

	public static int? GetIntSetting(string key)
	{
		ArgumentNullException.ThrowIfNull(key, nameof(key));

		if (_settings == null)
		{
			throw new InvalidOperationException("Settings not loaded.");
		}

		if (_settings.TryGetValue(key, out string? value) && int.TryParse(value, out int intValue))
		{
			return intValue;
		}

		return null;
	}

	public static double? GetDoubleSetting(string key)
	{
		ArgumentNullException.ThrowIfNull(key, nameof(key));

		if (_settings == null)
		{
			throw new InvalidOperationException("Settings not loaded.");
		}

		if (_settings.TryGetValue(key, out string? value) && double.TryParse(value, out double doubleValue))
		{
			return doubleValue;
		}

		return null;
	}

	public static string? GetStringSetting(string key)
	{
		ArgumentNullException.ThrowIfNull(key, nameof(key));

		if (_settings == null)
		{
			throw new InvalidOperationException("Settings not loaded.");
		}

		if (_settings.TryGetValue(key, out string? value) && value != null)
		{
			return value;
		}

		return null;
	}
}