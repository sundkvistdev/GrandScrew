namespace Engine;

internal class XmlReader
{
	private Stream _stream;
	private StreamReader _reader;
	
	private long _line;
	private long _column;

	public XmlReader(Stream stream)
	{
		

		_line = 1;
		_column = 1;
	}
}