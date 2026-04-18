import { db, procedureTemplatesTable, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MACDENT_SERVICES: Array<{
  name: string;
  price: number;
  category: string;
  code: string | null;
}> = [
  { name: "Консультация (осмотр и прием пациента без лечения)", price: 0, category: "other", code: "1" },
  { name: "Лечение кариеса с использованием пломбировочного материала светового отверждения (1 анестезия включительно) поверхностный", price: 6000, category: "therapy", code: "301" },
  { name: "Лечение кариеса с использованием пломбировочного материала светового отверждения (1 анестезия включительно) глубокий", price: 15000, category: "therapy", code: "303" },
  { name: "Лечение кариеса с использованием пломбировочного материала светового отверждения (1 анестезия включительно) средний", price: 10000, category: "therapy", code: "1042" },
  { name: "Лечение пульпита с последующей пломбой светового отверждения (1 анестезия включена, без стоимости штифта) 1-корневого зуба", price: 18000, category: "therapy", code: "501" },
  { name: "Лечение пульпита с последующей пломбой светового отверждения (1 анестезия включена, без стоимости штифта) многокорневого зуба", price: 25000, category: "therapy", code: "503" },
  { name: "Реставрация 1 зуба (1 анестезия включена, без стоимости штифта) во фронтальной группе зубов", price: 30000, category: "therapy", code: "8" },
  { name: "Лечение пульпита постоянных зубов (включая анестезию, пломбировочные материалы) одномоментно", price: 18000, category: "therapy", code: "12" },
  { name: "Лечение пульпита постоянных зубов 1-корневого зуба (включая анестезию, пломбировочные материалы) 3 посещения", price: 20000, category: "therapy", code: "13" },
  { name: "Лечение пульпита постоянных зубов 2-корневого зуба (включая анестезию, пломбировочные материалы) 3 посещения", price: 23000, category: "therapy", code: "14" },
  { name: "Лечение пульпита постоянных зубов 3-корневого зуба (включая анестезию, пломбировочные материалы) 3 посещения", price: 25000, category: "therapy", code: "15" },
  { name: "Лечение периодонтита постоянных зубов (включая анестезию, пломбировочные материалы) одномоментно", price: 22000, category: "therapy", code: "16" },
  { name: "Лечение периодонтита постоянных зубов 1-корневого зуба (включая анестезию, пломбировочные материалы без стоимости штифта) 3 посещения", price: 24000, category: "therapy", code: "17" },
  { name: "Лечение периодонтита постоянных зубов 2-корневого зуба (включая анестезию, пломбировочные материалы без стоимости штифта) 3 посещения", price: 27000, category: "therapy", code: "18" },
  { name: "Лечение периодонтита постоянных зубов 3-корневого зуба (включая анестезию, пломбировочные материалы без стоимости штифта) 3 посещения", price: 30000, category: "therapy", code: "19" },
  { name: "Коррекция пломбы", price: 0, category: "therapy", code: null },
  { name: "Стекловолоконная лента для шинирования/армирования зубов INTERLIG", price: 10000, category: "therapy", code: null },
  { name: "Анестезия", price: 1000, category: "other", code: null },
  { name: "Ортодонтический набор Те-Ре №1 (Зубная щётка Supreme Compact Soft, Монопучок TUFT, межзубный ёршик Angle, межзубный ёршик Original, индикатор кариеса в таблетках, ортовоск)", price: 5000, category: "hygiene", code: null },
  { name: "Снятие зубных отложений ультразвуковым аппаратом 1 зуб", price: 500, category: "hygiene", code: null },
  { name: "Снятие зубных отложений щеткой (вся полость рта)", price: 6000, category: "hygiene", code: null },
  { name: "Снятие зубных отложений ультразвуковым аппаратом (вся полость рта)", price: 15000, category: "hygiene", code: null },
  { name: "Покрытие фторлаком (1зуб)", price: 400, category: "pediatric", code: null },
  { name: "Серебрение (1 зуб)", price: 700, category: "pediatric", code: null },
  { name: "Анемнезация 10% лидокаин", price: 500, category: "pediatric", code: null },
  { name: "Наложение девитализирующей пасты", price: 2500, category: "pediatric", code: null },
  { name: "Пломбирование молочных зубов по среднему кариесу", price: 10000, category: "pediatric", code: null },
  { name: "Лечение периодонтита молочных зубов (3 посещения)", price: 20000, category: "pediatric", code: null },
  { name: "Лечение периодонтита молочных зубов (одномоментно)", price: 20000, category: "pediatric", code: null },
  { name: "Удаление молочных зубов (простое)", price: 8000, category: "pediatric", code: null },
  { name: "Удаление молочных зубов (сложное)", price: 10000, category: "pediatric", code: null },
  { name: "Удаление постоянных зубов (1-ой степени сложности)", price: 7000, category: "surgery", code: null },
  { name: "Удаление постоянных зубов (2-ой степени сложности)", price: 9000, category: "surgery", code: null },
  { name: "Удаление постоянных зубов (3-й степени сложности)", price: 15000, category: "surgery", code: null },
  { name: "Удаление зубов мудрости (8 -ка)", price: 20000, category: "surgery", code: null },
  { name: "Наложение швов", price: 5000, category: "surgery", code: null },
  { name: "Удаление постоянного зуба с последующей подготовкой к имплантации с использованием костного материала и наложением швов", price: 60000, category: "surgery", code: null },
  { name: "Удаление ретинированного зуба мудрости (простое)", price: 30000, category: "surgery", code: null },
  { name: "Удаление ретинированного зуба мудрости (сложное)", price: 37000, category: "surgery", code: null },
  { name: "Периостомия, иссечение «капюшона»", price: 8000, category: "surgery", code: null },
  { name: "Пластика рецессии десны 1ед.", price: 30000, category: "surgery", code: null },
  { name: "Пластика рецессии десны от 3 до 5 ед.", price: 50000, category: "surgery", code: null },
  { name: "Мягко-тканная пластика со свободным забором соединительно- тканного трансплантанта", price: 60000, category: "surgery", code: null },
  { name: "Пластика соустья верхнечелюстной пазухи", price: 25000, category: "surgery", code: null },
  { name: "Вскрытие абсцесса", price: 8500, category: "surgery", code: null },
  { name: "Лечение альвеолита", price: 6000, category: "surgery", code: null },
  { name: "Операция, резекция верхушки корня однокорневого зуба", price: 24000, category: "surgery", code: null },
  { name: "Пластика уздечки верхней губы", price: 25000, category: "surgery", code: null },
  { name: "Пластика уздечки языка с наложением швов", price: 25000, category: "surgery", code: null },
  { name: "Снятие швов после операции или удаления зуба", price: 1200, category: "surgery", code: null },
  { name: "Использование мембраны при удалении или FRP", price: 20000, category: "surgery", code: null },
  { name: "Моделирование альвеолярного гребня титановой мембраной", price: 200000, category: "surgery", code: null },
  { name: "Направленная костная регенерация с резорбированной мембраной", price: 150000, category: "surgery", code: null },
  { name: "Открытый Sinus Lifting (работа)", price: 200000, category: "surgery", code: null },
  { name: "Костный материал для Sinus Lifting 1 грамм", price: 65000, category: "surgery", code: null },
  { name: "Закрытый Sinus Lifting", price: 180000, category: "surgery", code: null },
  { name: "Расщепление альвеолярного гребня в области 1 до 3 зубов", price: 250000, category: "surgery", code: null },
  { name: "Формирование прикрепленной десны без соединительно- тканной трансплантации", price: 35000, category: "surgery", code: null },
  { name: "Аугментация костной ткани в области от 1 до 3 зубов", price: 80000, category: "surgery", code: null },
  { name: "Закрытый кюретаж (в области одного зуба)", price: 1500, category: "surgery", code: null },
  { name: "Открытый кюретаж (в области от 1 до 3 зубов)", price: 10000, category: "surgery", code: null },
  { name: "Использование коллагеновой мембраны в области 1 зуба, пр-во Германия", price: 50000, category: "surgery", code: null },
  { name: "Использование титановой мембраны, пр-во Юж. Корея", price: 50000, category: "surgery", code: null },
  { name: "Установка имплантанта OSSTEM, 1 ед., пр-во Юж. Корея", price: 120000, category: "implantation", code: null },
  { name: "Установка имплантанта DENTIUM, 1 ед., пр-во Юж. Корея", price: 130000, category: "implantation", code: null },
  { name: "Отторжение имплантанта", price: 0, category: "implantation", code: null },
  { name: "Переимплантация (без учёта импоантанта)", price: 28500, category: "implantation", code: null },
  { name: "Установка имплантанта Osstem вместо отторженного", price: 0, category: "implantation", code: null },
  { name: "Снятие слепка из альгинатной массы для диагностической модели", price: 4500, category: "orthopedics", code: null },
  { name: "Снятие двухслойного слепка С-силикон для диагностической модели", price: 7000, category: "orthopedics", code: null },
  { name: "Снятие слепка А-силикон для диагностической модели", price: 11000, category: "orthopedics", code: null },
  { name: "Фиксация 1 старой коронки", price: 3500, category: "orthopedics", code: null },
  { name: "Снятие старых штампованных коронок", price: 3500, category: "orthopedics", code: null },
  { name: "Снятие старых металлокерамических или литых коронок", price: 5500, category: "orthopedics", code: null },
  { name: "Коронка пластмассовая или временная", price: 10000, category: "orthopedics", code: null },
  { name: "Литая культевая вкладка", price: 13000, category: "orthopedics", code: null },
  { name: "Разборная культевая вкладка", price: 20000, category: "orthopedics", code: null },
  { name: "Цельнолитой зуб", price: 13000, category: "orthopedics", code: null },
  { name: "Металлокерамическая коронка Co-Cr (кобальт хром)", price: 25000, category: "orthopedics", code: null },
  { name: "Металлокерамическая коронка на импланте OSSTEM , пр-во Юж.Корея", price: 80000, category: "orthopedics", code: null },
  { name: "Металлокерамическая коронка на импланте DENTIUM, пр-во Юж.Корея", price: 100000, category: "orthopedics", code: null },
  { name: "Циркониевая коронка на своем зубе", price: 75000, category: "orthopedics", code: null },
  { name: "Циркониевая коронка на имплантат OSSTEM, пр-во Юж.Корея", price: 175000, category: "orthopedics", code: null },
  { name: "Циркониевая коронка на импланте DENTIUM, пр-во Юж.Корея", price: 175000, category: "orthopedics", code: null },
  { name: "Керамические виниры и вкладки 1ед.", price: 80000, category: "orthopedics", code: null },
  { name: "Изготовление микропротеза", price: 25000, category: "orthopedics", code: null },
  { name: "Изготовление микропротеза из термопласта", price: 35000, category: "orthopedics", code: null },
  { name: "Бюгельный протез на аттачментах", price: 160000, category: "orthopedics", code: null },
  { name: "Штампованная коронка 1 единица (включает полный объем работ по протезированию и материал)", price: 12000, category: "orthopedics", code: "4011" },
  { name: "Литая коронка 1 единица (включает полный объем работ по протезированию зуба и материал)", price: 10000, category: "orthopedics", code: "4012" },
  { name: "Пластмассовая коронка 1 единица(включает полный объем работ по протезированию зуба и материал)", price: 9000, category: "orthopedics", code: "4013" },
  { name: "Металлокерамическая коронка 1 единица(включает полный объем работ по протезированию зуба и материал)", price: 25000, category: "orthopedics", code: "4014" },
  { name: "Частичный съемный протез из пластмассы", price: 40000, category: "orthopedics", code: null },
];

export async function seedProcedureTemplates(clinicId: string): Promise<void> {
  for (const svc of MACDENT_SERVICES) {
    try {
      await db
        .insert(procedureTemplatesTable)
        .values({
          id: randomUUID(),
          clinicId,
          name: svc.name,
          defaultPrice: svc.price,
          category: svc.category,
          code: svc.code ?? null,
          materials: "[]",
        })
        .onConflictDoNothing();
    } catch {
    }
  }
}

export async function seedAllClinics(): Promise<void> {
  const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
  console.log(`Seeding ${MACDENT_SERVICES.length} services for ${clinics.length} clinics...`);
  for (const clinic of clinics) {
    await seedProcedureTemplates(clinic.id);
  }
  console.log("Done.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAllClinics().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
