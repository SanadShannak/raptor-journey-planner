import type { Dictionary } from './dictionary';

/**
 * Modern Standard Arabic.
 *
 * Strings are stored in *logical* order — sentence-final punctuation is written
 * last, as the last character of the string, even though the bidi algorithm
 * renders it on the left. Do not reorder characters to match what an editor
 * shows visually.
 *
 * Drafted to establish structure; every string should be reviewed by a native
 * speaker before release.
 */
export const ar: Dictionary = {
  app: {
    title: 'مخطط الرحلات',
  },
  language: {
    switcherLabel: 'اللغة',
  },
  theme: {
    switcherLabel: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    system: 'النظام',
  },
  status: {
    checkingBackend: 'جارٍ الاتصال بخدمة تخطيط الرحلات…',
    backendReachable: 'خدمة تخطيط الرحلات متاحة.',
    backendUnreachable: 'خدمة تخطيط الرحلات غير متاحة.',
    availableDates: {
      zero: 'لا تتوفر بيانات جداول زمنية.',
      one: 'تغطي بيانات الجداول الزمنية يومًا واحدًا، {first}.',
      two: 'تغطي بيانات الجداول الزمنية يومين، من {first} إلى {last}.',
      few: 'تغطي بيانات الجداول الزمنية {count} أيام، من {first} إلى {last}.',
      many: 'تغطي بيانات الجداول الزمنية {count} يومًا، من {first} إلى {last}.',
      other: 'تغطي بيانات الجداول الزمنية {count} يوم، من {first} إلى {last}.',
    },
  },

  units: {
    minutes: '{minutes} د',
    hours: '{hours} س',
    hoursMinutes: '{hours} س {minutes} د',
    meters: '{meters} م',
    kilometers: '{kilometers} كم',
  },
  modes: {
    tram: 'ترام',
    metro: 'مترو',
    rail: 'قطار',
    bus: 'حافلة',
    ferry: 'عبّارة',
    cableTram: 'ترام بكابل',
    aerialLift: 'تلفريك',
    funicular: 'قطار مائل',
    trolleybus: 'حافلة كهربائية',
    monorail: 'قطار أحادي السكة',
    unknown: 'وسيلة نقل',
  },
  errors: {
    generic: 'حدث خطأ ما. حاول مرة أخرى.',
    network: 'تعذّر الوصول إلى خدمة تخطيط الرحلات. تحقّق من اتصالك ثم حاول مرة أخرى.',
    timeout: 'استغرقت خدمة تخطيط الرحلات وقتًا طويلًا للردّ. حاول مرة أخرى.',
    malformed: 'أرسلت خدمة تخطيط الرحلات ردًّا يتعذّر على التطبيق قراءته.',
    serverError: 'واجهت خدمة تخطيط الرحلات مشكلة. حاول بعد قليل.',
    missingOrigin: 'اختر نقطة الانطلاق.',
    missingDestination: 'اختر الوجهة.',
    badDate: 'هذا التاريخ غير صالح. اختر تاريخًا آخر.',
    badTime: 'هذا الوقت غير صالح. اختر وقتًا آخر.',
    sameOriginTarget: 'نقطة الانطلاق والوجهة هما المكان نفسه. اختر نقطتين مختلفتين.',
    noActiveServices: 'لا تعمل أي رحلات في هذا التاريخ. جرّب يومًا آخر.',
    originOutOfBounds: 'نقطة الانطلاق خارج المنطقة التي تغطيها الجداول الزمنية.',
    originStopNotFound: 'محطة الانطلاق غير موجودة في الجداول الزمنية.',
    destinationOutOfBounds: 'الوجهة خارج المنطقة التي تغطيها الجداول الزمنية.',
    destinationStopNotFound: 'محطة الوجهة غير موجودة في الجداول الزمنية.',
  },
};
