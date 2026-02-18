# RF 433MHz Tool - Usage Guide

## Features
- ✅ Replay saved RF signals
- ✅ Brute force attacks
- ✅ Manual signal entry
- ✅ Signal library management

## Brute Force Attack

### What it does:
Iterates through a range of values and transmits each one. Useful for:
- Testing garage door openers (common range: 0x445700 with 8-16 bits)
- Rolling code attacks
- Remote control testing

### Settings Explained:

**Prefix (Hex)**
- The starting value (e.g., 0x445700)
- All values will start with this prefix

**Range Bits**
- How many bits to iterate (1-24)
- Total values = 2^bits
- Examples:
  - 8 bits = 256 values
  - 12 bits = 4,096 values
  - 16 bits = 65,536 values
  - 20 bits = 1,048,576 values

**Delay (ms)**
- Wait time between each transmission
- 200ms recommended (default)
- Lower = faster but may miss responses
- Higher = slower but more reliable

**Frequency**
- Target frequency in MHz
- Common: 433.92 MHz (default)
- Others: 315 MHz, 868 MHz, 915 MHz

**TE (Pulse Length)**
- Timing parameter (microseconds)
- Default: 174 μs
- Different protocols use different values
- Common values: 174, 320, 200

**Repeat Count**
- How many times to send each value
- Default: 10
- Higher = more reliable but slower

### Example Attack Scenarios:

**Garage Door (8-bit)**
```
Prefix: 0x445700
Bits: 8
Delay: 200ms
Frequency: 433.92 MHz
TE: 174
Repeat: 10
Time: ~51 seconds (256 values)
```

**Larger Range (12-bit)**
```
Prefix: 0x445700
Bits: 12
Delay: 200ms
Time: ~13.6 minutes (4,096 values)
```

**Gate Opener (16-bit)**
```
Prefix: 0x440000
Bits: 16
Delay: 150ms
Time: ~2.7 hours (65,536 values)
```

### Security Warning:
⚠️ **USE RESPONSIBLY!**
- Only use on your own devices
- Some systems may lock out after multiple attempts
- Excessive transmissions may be illegal in some jurisdictions
- Always check local regulations

### Tips:
1. Start with smaller bit ranges (8-10) to test
2. If you know part of the code, use it as the prefix
3. Monitor the target device for responses
4. Hold any key to stop the attack at any time
5. Consider using lower delays if device is responsive

## Signal Replay

### Add New Signal:
1. Use Bruce's RF menu to capture a signal
2. Note the hex data, frequency, and TE
3. Go to "Add New Signal" in this script
4. Enter the details

### Replay Signal:
1. Navigate to "Saved Signals"
2. Select your signal
3. Choose "Replay"

## Storage:
- Signals saved to: `/rf433_saved.json`
- Persists between reboots
- Can be backed up from SD card

## Bruce Firmware Limitation:
Bruce JS cannot scan/receive RF signals - only transmit.
Use the built-in RF menu for scanning: **RF → SubGHz → Receive**
