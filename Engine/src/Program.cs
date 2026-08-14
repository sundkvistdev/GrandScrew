namespace Engine
{
	internal class Program
	{
		public static int Main(string[] args)
		{
			Console.WriteLine("Start");

			SettingsManager.LoadSettings();

			return 0;
		}
	}
}