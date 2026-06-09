// Tipe minimal untuk flowbite-datepicker (paket "Flowbite, datepicker saja").
// Hanya mencakup API yang dipakai oleh src/components/DatePicker.tsx.
declare module 'flowbite-datepicker/Datepicker' {
  export interface DatepickerOptions {
    autohide?: boolean;
    format?: string;
    maxDate?: Date | string | null;
    minDate?: Date | string | null;
    todayHighlight?: boolean;
    orientation?: string;
    language?: string;
    [key: string]: unknown;
  }

  export default class Datepicker {
    static locales: Record<string, unknown>;
    constructor(element: HTMLElement, options?: DatepickerOptions);
    setDate(
      date: string | Date | { clear: boolean },
      options?: { silent?: boolean },
    ): void;
    getDate(format?: string): Date | string;
    destroy(): void;
    show(): void;
    hide(): void;
  }
}
