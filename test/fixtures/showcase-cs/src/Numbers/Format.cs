using System.Globalization;

namespace Numbers;

/// <summary>Formats numbers.</summary>
public static class Format
{
    /// <summary>Formats a number with thousands separators.</summary>
    public static string Thousands(long value) => value.ToString("N0", CultureInfo.InvariantCulture);
}
