namespace Engine;

internal class XmlTag
{
	private string _name;
	private Dictionary<string, string> _attributes;
	private List<XmlTag> _children;
	private List<string> _content;

	public string Name { get => _name; set => _name = value; }
	public IReadOnlyDictionary<string, string> Attributes { get => _attributes; }
	public IReadOnlyList<XmlTag> Children { get => _children; }
	public IReadOnlyList<string> Content { get => _content; }

	private XmlTag(string name, Dictionary<string, string> attributes, List<XmlTag> children, List<string> content)
	{
		_name = name;
		_attributes = attributes;
		_children = children;
		_content = content;
	}

	public XmlTag(string name):
		this(name, [], [], [])
	{
	}

	public static XmlTag CreateXmlTag(string name, Dictionary<string, string> attributes, List<XmlTag> children, List<string> content)
	{
		return new XmlTag(name, attributes, children, content);
	}
}