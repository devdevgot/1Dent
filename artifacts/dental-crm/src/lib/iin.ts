export type Gender = "male" | "female";

export interface IINParseResult {
  dateOfBirth: Date;
  gender: Gender;
}

export interface IINParseError {
  error: string;
}

export type IINResult = IINParseResult | IINParseError;

export function isIINError(result: IINResult): result is IINParseError {
  return "error" in result;
}

export function parseIIN(iin: string): IINResult {
  if (!/^\d{12}$/.test(iin)) {
    return { error: "ИИН должен содержать ровно 12 цифр" };
  }

  const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const weights2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

  const digits = iin.split("").map(Number);

  let sum1 = 0;
  for (let i = 0; i < 11; i++) {
    sum1 += digits[i]! * weights1[i]!;
  }
  let checkDigit = sum1 % 11;

  if (checkDigit === 10) {
    let sum2 = 0;
    for (let i = 0; i < 11; i++) {
      sum2 += digits[i]! * weights2[i]!;
    }
    checkDigit = sum2 % 11;
    if (checkDigit === 10) {
      return { error: "ИИН не прошёл проверку контрольной суммы" };
    }
  }

  if (checkDigit !== digits[11]) {
    return { error: "ИИН не прошёл проверку контрольной суммы" };
  }

  const yy = parseInt(iin.slice(0, 2), 10);
  const mm = parseInt(iin.slice(2, 4), 10);
  const dd = parseInt(iin.slice(4, 6), 10);
  const centuryCode = digits[6]!;

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return { error: "ИИН содержит некорректную дату" };
  }

  let fullYear: number;
  if (centuryCode >= 1 && centuryCode <= 2) {
    fullYear = 1800 + yy;
  } else if (centuryCode >= 3 && centuryCode <= 4) {
    fullYear = 1900 + yy;
  } else if (centuryCode >= 5 && centuryCode <= 6) {
    fullYear = 2000 + yy;
  } else {
    return { error: "ИИН содержит некорректный код века" };
  }

  const dateOfBirth = new Date(fullYear, mm - 1, dd);
  if (
    dateOfBirth.getFullYear() !== fullYear ||
    dateOfBirth.getMonth() + 1 !== mm ||
    dateOfBirth.getDate() !== dd
  ) {
    return { error: "ИИН содержит некорректную дату" };
  }

  const gender: Gender = centuryCode % 2 === 1 ? "male" : "female";

  return { dateOfBirth, gender };
}

export function maskIIN(iin: string): string {
  if (iin.length !== 12) return iin;
  return iin.slice(0, 6) + "XXXXXX";
}

export function calculateAge(dateOfBirth: Date | string): number {
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function formatDateOfBirth(dateOfBirth: Date | string): string {
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  const dd = String(dob.getDate()).padStart(2, "0");
  const mm = String(dob.getMonth() + 1).padStart(2, "0");
  const yyyy = dob.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatPatientAge(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const age = calculateAge(dateOfBirth);
  const dob = formatDateOfBirth(dateOfBirth);
  return `${age} лет · ${dob}`;
}
