import type { ContractTemplate, FieldMapping } from "@workspace/db";
import { getExtractionTemplateText, renderExtractionTemplate } from "./extraction-templates";
import { renderContractHtml } from "./contracts.ai";
import {
  textToHtml,
  fillTreatmentPlanTable,
  fillActTable,
  type ContractTableItem,
} from "./contract-render";

export interface ContractFillContext {
  patientName: string;
  patientPhone: string;
  patientIin: string;
  patientDob: string;
  clinicName: string;
  clinicPhone: string;
  clinicCity: string;
  clinicAddress: string;
  clinicLicense: string;
  clinicDirector: string;
  doctorName: string;
  patientGender?: string;
}

/** Normalize DB / ISO DOB to dd.mm.yyyy for contracts. */
export function formatContractDobRu(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const raw = value.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}.${iso[3]}.${iso[1]}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return raw;
}

export function contractDateParts(date = new Date()): { date: string; year: string } {
  const dateStr = date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return { date: dateStr, year: String(date.getFullYear()) };
}

export function buildSystemTemplateVars(
  ctx: ContractFillContext,
  date = new Date(),
): Record<string, string> {
  const { date: dateStr, year } = contractDateParts(date);
  return {
    patient_name: ctx.patientName,
    clinic_name: ctx.clinicName,
    clinic_phone: ctx.clinicPhone,
    clinic_city: ctx.clinicCity,
    clinic_address: ctx.clinicAddress,
    clinic_license: ctx.clinicLicense,
    clinic_director: ctx.clinicDirector,
    doctor_name: ctx.doctorName,
    date: dateStr,
    year,
    iin: ctx.patientIin,
    dob: ctx.patientDob,
    phone: ctx.patientPhone,
  };
}

export function buildCustomFilledData(
  ctx: ContractFillContext,
  date = new Date(),
): Record<string, string> {
  const { date: dateStr, year } = contractDateParts(date);
  return {
    "patient.name": ctx.patientName,
    "patient.phone": ctx.patientPhone,
    "patient.iin": ctx.patientIin,
    "patient.dateOfBirth": ctx.patientDob,
    "patient.gender": ctx.patientGender ?? "",
    "doctor.name": ctx.doctorName,
    "clinic.name": ctx.clinicName,
    "clinic.city": ctx.clinicCity,
    "clinic.address": ctx.clinicAddress,
    "clinic.license": ctx.clinicLicense,
    "clinic.director": ctx.clinicDirector,
    "clinic.phone": ctx.clinicPhone,
    "date.today": dateStr,
    "date.year": year,
  };
}

export function collectContractFillWarnings(ctx: ContractFillContext): string[] {
  const warnings: string[] = [];
  if (!ctx.patientIin.trim()) warnings.push("ИИН пациента не указан");
  if (!ctx.patientDob.trim()) warnings.push("Дата рождения пациента не указана");
  if (!ctx.doctorName.trim()) {
    warnings.push("Лечащий врач не указан — в договоре останутся пустые поля врача");
  }
  if (!ctx.clinicCity.trim()) {
    warnings.push("Город клиники не заполнен (Настройки → Данные для договоров)");
  }
  if (!ctx.clinicAddress.trim()) {
    warnings.push("Адрес клиники не заполнен (Настройки → Данные для договоров)");
  }
  if (!ctx.clinicLicense.trim()) {
    warnings.push("Номер лицензии не заполнен (Настройки → Данные для договоров)");
  }
  if (!ctx.clinicDirector.trim()) {
    warnings.push("ФИО директора не заполнено (Настройки → Данные для договоров)");
  }
  return warnings;
}

export function renderSystemContractText(
  systemType: string,
  vars: Record<string, string>,
  planItems: ContractTableItem[] = [],
): string {
  const rawText = getExtractionTemplateText(systemType);
  let text = renderExtractionTemplate(rawText, vars);
  if (systemType.includes("комплексный_план_лечения")) {
    text = fillTreatmentPlanTable(text, planItems);
  } else if (systemType.includes("акт_сдачиприемки")) {
    text = fillActTable(text, planItems);
  }
  return text;
}

export function renderPatientContractHtml(
  template: ContractTemplate,
  ctx: ContractFillContext,
  fieldMappings: FieldMapping[],
  planItems: ContractTableItem[] = [],
  date = new Date(),
): { html: string; filledData: Record<string, string> } {
  if (template.isSystem && template.systemType) {
    const vars = buildSystemTemplateVars(ctx, date);
    const text = renderSystemContractText(template.systemType, vars, planItems);
    return { html: textToHtml(text), filledData: vars };
  }

  const filledData = buildCustomFilledData(ctx, date);
  return {
    html: renderContractHtml(template.extractedText ?? "", fieldMappings, filledData),
    filledData,
  };
}
