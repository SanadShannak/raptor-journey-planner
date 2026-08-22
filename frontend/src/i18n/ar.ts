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
    menuLabel: 'اللغة، المحددة حاليًا {value}',
  },
  theme: {
    switcherLabel: 'المظهر',
    menuLabel: 'المظهر، المحدد حاليًا {value}',
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

  nav: {
    sectionsLabel: 'الأقسام',
    primaryLabel: 'الرئيسية',
    skipToContent: 'تخطي إلى المحتوى',
    openMenu: 'القائمة',
    closeMenu: 'إغلاق القائمة',
    home: 'الرئيسية',
    plan: 'خطط رحلة',
    routes: 'الخطوط',
    stops: 'المحطات',
    card: 'بطاقة السفر',
  },
  pages: {
    home: {
      title: 'مخطط الرحلات',
      tagline: 'خطط رحلتك، وتصفّح الشبكة، واطّلع على جدول أي محطة.',
      planCard: 'خطط رحلة',
      planCardBody: 'مواعيد المغادرة والتبديل ومسافة المشي في الطرفين.',
      routesCard: 'تصفّح الخطوط',
      routesCardBody: 'كل خط، وأين يسير، والمحطات التي يقف عندها.',
      stopsCard: 'ابحث عن محطة',
      stopsCardBody: 'ما يغادر من المحطة، في أي يوم تغطيه الجداول.',
      cardCard: 'بطاقة السفر',
      cardCardBody: 'تحقق من رصيد بطاقتك.',
    },
    plan: { title: 'خطط رحلة', comingSoon: 'مخطط الرحلات قيد الإنشاء.' },
    routes: { title: 'الخطوط', comingSoon: 'تصفّح الخطوط قيد الإنشاء.' },
    stops: { title: 'المحطات', comingSoon: 'البحث عن المحطات قيد الإنشاء.' },
    card: {
      title: 'بطاقة السفر',
      needsAccount: 'التحقق من رصيد البطاقة يتطلّب حسابًا. الحسابات غير متاحة بعد.',
    },
    notFound: {
      title: 'الصفحة غير موجودة',
      body: 'لا يطابق هذا العنوان أي صفحة في الموقع. ربما تمّ نقلها، أو أن الرابط مكتوب خطأ.',
      backHome: 'الذهاب إلى الصفحة الرئيسية',
    },
  },
  auth: {
    logIn: 'تسجيل الدخول',
    signUp: 'إنشاء حساب',
    close: 'إغلاق',
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    submitLogIn: 'تسجيل الدخول',
    submitSignUp: 'إنشاء الحساب',
    switchToSignUp: 'ليس لديك حساب؟ أنشئ حسابًا',
    switchToLogIn: 'لديك حساب بالفعل؟ سجّل الدخول',
    unavailable: 'الحسابات غير متاحة بعد. كل ما عدا ذلك في الموقع يعمل دون حساب.',
    nameRequired: 'أدخل اسمك.',
    emailRequired: 'أدخل بريدك الإلكتروني.',
    emailInvalid: 'أدخل بريدًا إلكترونيًا مثل name@example.com.',
    passwordRequired: 'أدخل كلمة مرور.',
    passwordTooShort: 'استخدم 8 أحرف على الأقل.',
  },
};
