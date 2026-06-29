export interface DoctorWithSlots {
  id: string;
  name: string;
  specialty: string | null;
  slots: Date[];
}
