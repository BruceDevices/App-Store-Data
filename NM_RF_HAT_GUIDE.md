# RF Brute Force Tool - NM-RF HAT Edition

## Hardware Requirements
- **ESP32 CYD-2432S028** (Cheap Yellow Display)
- **NM-RF HAT** with CC1101 module (433MHz)
- **Bruce Firmware** installed
- **Antenna** connected to NM-RF HAT

## Hardware Setup

### NM-RF HAT Connection
The NM-RF HAT connects to the ESP32 via SPI pins:
- **CS (Chip Select)**: GPIO 5
- **SCK (Clock)**: GPIO 18
- **MOSI**: GPIO 23
- **MISO**: GPIO 19
- **GDO0**: GPIO 2 (optional interrupt)
- **GDO2**: GPIO 4 (optional)
- **3.3V & GND**: Power supply

### Antenna
- Connect a 433MHz antenna (17.3cm wire works)
- For better range, use a proper 433MHz antenna
- Position antenna away from metal objects

## Features

### 🎯 Smart Presets
Pre-configured for common devices:
- **Garage Door (8-bit)**: 256 values, ~51 seconds
- **Garage Door (12-bit)**: 4,096 values, ~10 minutes
- **Gate Opener (16-bit)**: 65,536 values, ~1.8 hours
- **Doorbell (10-bit)**: 1,024 values, ~4 minutes
- **Remote Control (24-bit)**: 16.7M values, ~3.8 days
- **Car Key (20-bit)**: 1M values, ~23 hours

### 📊 Advanced Features
- **Resume Capability**: Stop and resume attacks
- **Reverse Mode**: Brute force backwards
- **Progress Tracking**: Real-time ETA and statistics
- **Error Handling**: Monitors transmission failures
- **Test Mode**: Test single values before attack

## Configuration Parameters

### Prefix (Hex)
The starting value for your attack. Examples:
- `0x445700` - Common garage door prefix
- `0x123400` - Doorbell systems
- `0xA00000` - Generic remote
- `0x100000` - Car key fobs

**How to find:** Use Bruce's RF receiver to capture a signal, then use part of it as the prefix.

### Range Bits
Determines how many values to try:
```
Bits | Values    | Time @ 200ms
-----|-----------|-------------
8    | 256       | 51 seconds
10   | 1,024     | 3.4 minutes
12   | 4,096     | 13.6 minutes
14   | 16,384    | 54.6 minutes
16   | 65,536    | 3.6 hours
18   | 262,144   | 14.5 hours
20   | 1,048,576 | 58 hours
24   | 16,777,216| 38.8 days
```

### Frequency
Common frequencies:
- **433.92 MHz** (default) - Most garage doors, remotes
- **315.00 MHz** - US car keys, some remotes
- **868.35 MHz** - EU devices
- **915.00 MHz** - US ISM band

### TE (Timing Element)
Pulse length in microseconds:
- **174 μs** - Most common (default)
- **200 μs** - Some garage systems
- **320 μs** - Longer pulse devices
- **350 μs** - Doorbells
- **400 μs** - Some gate openers

### Repeat Count
How many times to send each value:
- **5-8**: Fast attack, may miss responses
- **10** (default): Good balance
- **15-20**: Slower but more reliable

### Delay
Wait time between transmissions:
- **50-100ms**: Very fast (may overload receiver)
- **150-200ms** (recommended): Good balance
- **250-500ms**: Slower but more reliable

## Usage Guide

### Quick Start (8-bit Garage Attack)
1. Load the script on your CYD
2. Select "Quick 8-bit Attack"
3. Attack starts immediately with safe defaults
4. Hold any key to stop

### Custom Configuration
1. Select "Configure & Attack"
2. Choose "Load Preset" or manually configure:
   - Set Prefix (if you know part of the code)
   - Choose bit range
   - Adjust timing parameters
3. Select "START ATTACK"
4. Monitor progress

### Resume Feature
If you stop an attack:
1. The script saves your position
2. Return to "Configure & Attack"
3. Check "Advanced" → "Start Value"
4. It shows where you stopped
5. Start again to resume from that point

### Advanced Options
Access via "Advanced" menu:
- **Reverse Direction**: Attack from high to low values
- **Start Value**: Resume from specific position
- **Test Single Value**: Test before full attack

## Attack Strategies

### Strategy 1: Known Prefix
If you captured a signal and know part of the code:
```
Example: Captured 0x445712
Prefix: 0x445700 (keep first 6 digits)
Bits: 8 (iterate last 2 digits)
Result: Tests 0x445700 to 0x4457FF
```

### Strategy 2: Full Range
No prior knowledge:
```
Prefix: 0x000000
Bits: 24
Warning: This takes days!
```

### Strategy 3: Smart Guess
Based on device type:
```
Garage doors often use:
- Prefix: 0x44xxxx or 0x45xxxx
- Start with 8-12 bits
- TE: 174 or 200
```

### Strategy 4: Binary Search
Narrow down the range:
1. Start with 12 bits
2. If no response, try different prefix
3. If you get close, reduce to 8 bits
4. Fine-tune the exact range

## Security & Legal

### ⚠️ CRITICAL WARNINGS
- **Only use on YOUR devices** that you own
- **Illegal** to attack devices you don't own
- Some devices **lock out** after failed attempts
- May violate FCC regulations if misused
- Could trigger alarms or security systems

### Responsible Use
- Test on your own garage door with backup remote
- Warn neighbors before testing (RF interference)
- Don't use in public spaces
- Keep logs of your testing
- Have physical access to the device

### Legal Considerations
- **USA**: FCC Part 15 governs unlicensed RF
- **EU**: ETSI regulations apply
- **Penalties**: Fines, equipment seizure, prosecution
- **Civil liability**: Damage to devices you don't own

## Troubleshooting

### No Transmissions / High Failure Rate
- Check NM-RF HAT connection
- Verify CC1101 module is seated properly
- Ensure antenna is connected
- Check power supply (3.3V)
- Test with "Test Single Value" function

### Device Not Responding
- Wrong frequency - try 315MHz or 868MHz
- Wrong TE value - common: 174, 200, 320, 350
- Too fast - increase delay to 300-500ms
- Increase repeat count to 15-20
- Device may have rolling code (won't work)

### Attack Too Slow
- Reduce delay (min 50ms)
- Reduce repeat count (min 5)
- Use fewer bits if possible
- Check if device needs fewer repeats

### NM-RF HAT Not Detected
- Check SPI wiring
- Verify in Bruce menu: RF → SubGHz → Config
- Ensure Bruce firmware supports your HAT
- Try power cycle

## Performance Tips

### Optimize Speed
1. Find minimum repeat count that works (test with known code)
2. Reduce delay as much as device allows
3. Use directional antenna for better signal

### Improve Success Rate
1. Position CYD close to target device (1-3 meters)
2. Remove obstacles between devices
3. Attack during low RF noise (night time)
4. Use higher repeat count (15-20)

### Battery Life (if portable)
- Reduce LCD brightness
- Increase delay between transmissions
- Use lower repeat count if possible

## Technical Details

### CC1101 Module
- **Chip**: Texas Instruments CC1101
- **Frequency Range**: 300-928 MHz
- **Modulation**: ASK/OOK, FSK, GFSK, MSK
- **Data Rate**: Up to 600 kbps
- **Power**: 3.3V, ~30mA TX, ~15mA RX

### Transmission Format
```
subghzTransmit(data, frequency, te, repeat)
- data: Hex string (e.g., "445712")
- frequency: In Hz (e.g., 433920000)
- te: Pulse length in μs (e.g., 174)
- repeat: Number of repetitions (e.g., 10)
```

## Examples

### Example 1: Garage Door (Known Prefix)
```
Captured signal: 0x44571A
Config:
- Prefix: 0x445700
- Bits: 8
- Frequency: 433.92 MHz
- TE: 174
- Repeat: 10
- Delay: 200ms

Result: Tests 256 values in ~51 seconds
```

### Example 2: Gate Opener (Unknown)
```
Config:
- Prefix: 0x440000
- Bits: 16
- Frequency: 433.92 MHz
- TE: 200
- Repeat: 8
- Delay: 150ms

Result: Tests 65,536 values in ~2.7 hours
```

### Example 3: Car Key Fob
```
Note: Most modern cars use rolling codes - WON'T WORK!
Old cars (pre-2000):
- Prefix: 0x100000
- Bits: 20
- Frequency: 315.00 MHz (US) or 433.92 MHz (EU)
- TE: 174
- Repeat: 6
- Delay: 100ms

Result: Tests 1M values in ~27 hours
```

## Statistical Analysis

### Success Probability
If the device uses a uniformly random code:
- 8-bit: 100% coverage
- 12-bit: 100% coverage (with time)
- 16-bit: 100% coverage (with patience)
- 24-bit+: Impractical (days/weeks)

### Expected Time to Success
On average, you'll find the code at:
- **50% through** the range
- Example: 12-bit = 2,048 values tried before success

## Support & Updates

### Bruce Firmware
- Check for updates: https://github.com/pr3y/Bruce
- SubGHz features may change
- Join Discord for support

### Script Updates
- This script works with current Bruce JS API
- API may change in future versions
- Test with known codes first

## Credits & Resources

- **Bruce Firmware**: pr3y/Bruce
- **CC1101 Module**: Texas Instruments
- **URH**: Universal Radio Hacker (for signal analysis)
- **Flipper Zero**: Inspiration for many features

---

**Remember: With great power comes great responsibility. Use wisely!**
