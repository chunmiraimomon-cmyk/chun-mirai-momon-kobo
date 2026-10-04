const COURSE_CODE_PREFIX_V1 = "KC1-";
const COURSE_CODE_PREFIX_V2 = "KC2-";
const COURSE_CODE_THEMES = ["city", "jungle", "starlight", "cloud"] as const;
const MAX_CODE_PARTS = 50;
const MAX_CODE_HAZARDS = 24;

export type CourseCodeHazard = {
  id: string;
  type: string;
  partIndex: number;
  lane: number;
  interval: number;
  speed: number;
  width: number;
  intensity: number;
  enabled: boolean;
};

export type CourseCodeHazardDefinition = {
  id: string;
  defaults: Pick<CourseCodeHazard, "lane" | "interval" | "speed" | "width" | "intensity">;
};

class BitWriter {
  private bits: number[] = [];

  write(value: number, width: number) {
    for (let bit = width - 1; bit >= 0; bit -= 1) {
      this.bits.push((value >> bit) & 1);
    }
  }

  toBytes() {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, index) => {
      bytes[Math.floor(index / 8)] |= bit << (7 - index % 8);
    });
    return bytes;
  }
}

class BitReader {
  private offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get remainingBits() {
    return this.bytes.length * 8 - this.offset;
  }

  read(width: number) {
    if (width < 0 || this.remainingBits < width) throw new Error("コースコードのデータが途中で切れています。");
    let value = 0;
    for (let bit = 0; bit < width; bit += 1) {
      const index = this.offset + bit;
      value = value * 2 + ((this.bytes[Math.floor(index / 8)] >> (7 - index % 8)) & 1);
    }
    this.offset += width;
    return value;
  }
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.001;
}

function crc16(bytes: Uint8Array) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("コースコードに使用できない文字が含まれています。");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary = "";
  try {
    binary = atob(base64);
  } catch {
    throw new Error("コースコードを読み取れませんでした。");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytesToBase64Url(bytes) !== value) throw new Error("コースコードの文字列形式が正しくありません。");
  return bytes;
}

function hasDefaultParameters(hazard: CourseCodeHazard, definition: CourseCodeHazardDefinition) {
  return nearlyEqual(hazard.lane, definition.defaults.lane)
    && (hazard.type === "river" || nearlyEqual(hazard.interval, definition.defaults.interval))
    && nearlyEqual(hazard.speed, definition.defaults.speed)
    && nearlyEqual(hazard.width, definition.defaults.width)
    && nearlyEqual(hazard.intensity, definition.defaults.intensity);
}

export function encodeCourseCode(
  parts: readonly string[],
  hazards: readonly CourseCodeHazard[],
  partIds: readonly string[],
  hazardDefinitions: readonly CourseCodeHazardDefinition[],
  theme = "city",
) {
  if (parts.length < 1 || parts.length > MAX_CODE_PARTS) throw new Error("コースパーツ数がコードの対応範囲外です。");
  if (hazards.length > MAX_CODE_HAZARDS) throw new Error("ギミック数がコードの対応範囲外です。");
  if (partIds.length > 8 || hazardDefinitions.length > 8) throw new Error("コード形式で扱える種類数を超えています。");

  const writer = new BitWriter();
  writer.write(parts.length - 1, 6);
  writer.write(hazards.length, 5);
  const themeCode = COURSE_CODE_THEMES.indexOf(theme as typeof COURSE_CODE_THEMES[number]);
  if (themeCode < 0) throw new Error("未対応の景観が選択されています。");
  const usesThemeExtension = themeCode !== 0;
  if (usesThemeExtension) writer.write(themeCode, 2);

  parts.forEach((part) => {
    const partCode = partIds.indexOf(part);
    if (partCode < 0) throw new Error("未対応のコースパーツが含まれています。");
    writer.write(partCode, 3);
  });

  hazards.forEach((hazard) => {
    const hazardCode = hazardDefinitions.findIndex((definition) => definition.id === hazard.type);
    const definition = hazardDefinitions[hazardCode];
    if (hazardCode < 0 || !definition) throw new Error("未対応のギミックが含まれています。");
    if (hazard.partIndex < 0 || hazard.partIndex >= parts.length) throw new Error("ギミックの設置区間がコース外です。");

    const customParameters = !hasDefaultParameters(hazard, definition);
    writer.write(hazardCode, 3);
    writer.write(clampInteger(hazard.partIndex, 0, 49), 6);
    writer.write(hazard.enabled ? 1 : 0, 1);
    writer.write(customParameters ? 1 : 0, 1);
    if (!customParameters) return;

    writer.write(clampInteger(hazard.lane + 7, 0, 14), 4);
    if (hazard.type !== "river") writer.write(clampInteger((hazard.interval - 2) * 2, 0, 26), 5);
    writer.write(clampInteger((hazard.speed - 0.5) * 10, 0, 15), 4);
    writer.write(clampInteger(hazard.width - 2, 0, 10), 4);
    writer.write(clampInteger(hazard.intensity - 1, 0, 2), 2);
  });

  const data = writer.toBytes();
  const checksum = crc16(data);
  const packet = new Uint8Array(data.length + 2);
  packet.set(data);
  packet[data.length] = checksum >> 8;
  packet[data.length + 1] = checksum & 0xff;
  return `${usesThemeExtension ? COURSE_CODE_PREFIX_V2 : COURSE_CODE_PREFIX_V1}${bytesToBase64Url(packet)}`;
}

export function decodeCourseCode(
  input: string,
  partIds: readonly string[],
  hazardDefinitions: readonly CourseCodeHazardDefinition[],
) {
  const compact = input.trim().replace(/\s+/g, "");
  const themed = compact.startsWith(COURSE_CODE_PREFIX_V2);
  const legacy = compact.startsWith(COURSE_CODE_PREFIX_V1);
  if (!themed && !legacy) throw new Error("KC1-またはKC2-から始まるコースコードを入力してください。");
  const prefix = themed ? COURSE_CODE_PREFIX_V2 : COURSE_CODE_PREFIX_V1;
  const packet = base64UrlToBytes(compact.slice(prefix.length));
  if (packet.length < 5) throw new Error("コースコードが短すぎます。");

  const data = packet.slice(0, -2);
  const expectedChecksum = packet[packet.length - 2] * 256 + packet[packet.length - 1];
  if (crc16(data) !== expectedChecksum) throw new Error("コースコードが壊れているか、入力内容が違います。");

  const reader = new BitReader(data);
  const partCount = reader.read(6) + 1;
  const hazardCount = reader.read(5);
  const theme = themed ? COURSE_CODE_THEMES[reader.read(2)] : "city";
  if (partCount > MAX_CODE_PARTS || hazardCount > MAX_CODE_HAZARDS) throw new Error("コースコードの登録数が上限を超えています。");

  const parts = Array.from({ length: partCount }, () => {
    const part = partIds[reader.read(3)];
    if (!part) throw new Error("このバージョンでは使えないコースパーツが含まれています。");
    return part;
  });

  const importedAt = Date.now().toString(36);
  const hazards: CourseCodeHazard[] = Array.from({ length: hazardCount }, (_, index) => {
    const definition = hazardDefinitions[reader.read(3)];
    if (!definition) throw new Error("このバージョンでは使えないギミックが含まれています。");
    const partIndex = reader.read(6);
    if (partIndex >= partCount) throw new Error("ギミックの設置区間がコース外です。");
    const enabled = reader.read(1) === 1;
    const customParameters = reader.read(1) === 1;
    const defaults = definition.defaults;
    if (!customParameters) {
      return { id: `code-${importedAt}-${index}`, type: definition.id, partIndex, ...defaults, enabled };
    }

    const lane = reader.read(4) - 7;
    const interval = definition.id === "river" ? defaults.interval : 2 + reader.read(5) * 0.5;
    const speed = 0.5 + reader.read(4) * 0.1;
    const width = 2 + reader.read(4);
    const intensity = 1 + reader.read(2);
    if (lane > 7 || interval > 15 || speed > 2 || width > 12 || intensity > 3) {
      throw new Error("ギミックの設定値が対応範囲外です。");
    }
    return { id: `code-${importedAt}-${index}`, type: definition.id, partIndex, lane, interval, speed, width, intensity, enabled };
  });

  if (reader.remainingBits >= 8) throw new Error("コースコードの末尾に余分なデータがあります。");
  while (reader.remainingBits > 0) {
    if (reader.read(1) !== 0) throw new Error("コースコードの余白データが不正です。");
  }
  return { parts, hazards, theme };
}
