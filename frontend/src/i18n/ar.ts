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
  common: {
    scheduleEstimateNotice:
      'الأوقات والمواقع المعروضة هنا تقديرية من الجدول الزمني المنشور، وليست تتبعًا مباشرًا. قد تختلف الأوقات الفعلية عنها.',
  },
  app: {
    title: 'مخطط الرحلات',
  },
  language: {
    switcherLabel: 'اللغة',
  },
  theme: {
    switcherLabel: 'المظهر',
    switchToLight: 'التبديل إلى المظهر الفاتح',
    switchToDark: 'التبديل إلى المظهر الداكن',
    light: 'فاتح',
    dark: 'داكن',
    system: 'النظام',
  },
  status: {
    checkingBackend: 'جارٍ الاتصال بخدمة تخطيط الرحلات…',
    backendReachable: 'خدمة تخطيط الرحلات متاحة.',
    backendUnreachable: 'خدمة تخطيط الرحلات غير متاحة.',
    clockLabel: 'الوقت في {network}',
    loadingPage: 'جارٍ التحميل…',
    availableDates: {
      zero: 'لا تتوفر بيانات جداول زمنية.',
      one: 'تغطي بيانات الجداول الزمنية يومًا واحدًا، {first}.',
      two: 'تغطي بيانات الجداول الزمنية يومين، من {first} إلى {last}.',
      few: 'تغطي بيانات الجداول الزمنية {count} أيام، من {first} إلى {last}.',
      many: 'تغطي بيانات الجداول الزمنية {count} يومًا، من {first} إلى {last}.',
      other: 'تغطي بيانات الجداول الزمنية {count} يوم، من {first} إلى {last}.',
    },
    resultsUnavailable: 'يتعذّر تحميل النتائج الآن.',
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
    rateLimited: 'محاولات كثيرة في وقت قصير. انتظر دقيقة ثم حاول مجددًا.',
    requestBlocked: 'حُظر هذا الطلب لأنه بدا آليًا. إن كان ذلك خطأً، فحاول مجددًا بعد قليل.',
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
    stopNotFound: 'لا توجد محطة بهذا المعرّف في هذه الجداول الزمنية.',
    cardNotFound: 'لا توجد بطاقة بهذا الرقم. تحقّق من الأرقام وحاول مرة أخرى.',
    badCardNumber: 'هذا ليس رقم بطاقة. رقم البطاقة أحد عشر رقمًا.',
    cardStoreUnavailable: 'الاستعلام عن الرصيد غير متاح حاليًا. أما بقية الموقع فيعمل كالمعتاد.',

    unauthorized: 'تم تسجيل خروجك. سجّل الدخول مرة أخرى للمتابعة.',
    emailInUse: 'يوجد حساب بهذا البريد الإلكتروني بالفعل. سجّل الدخول بدلًا من ذلك.',
    invalidCredentials: 'البريد الإلكتروني وكلمة المرور لا يطابقان أي حساب.',
    invalidSubmission: 'تحقّق من البيانات التي أدخلتها وحاول مرة أخرى.',
    insufficientBalance: 'رصيد هذه البطاقة غير كافٍ. اشحنها أولًا.',
    invalidAmount: 'هذا المبلغ غير صالح. استخدم الأرقام بحد أقصى ثلاث خانات عشرية.',
    cardLimitReached: 'لديك بالفعل أقصى عدد من البطاقات يسمح به الحساب. احذف واحدة لإفساح المجال.',
    cardHasBalance: 'لا يزال على هذه البطاقة رصيد. اصرفه أو انقله قبل حذفها.',
    duplicateCardNickname: 'إحدى بطاقاتك الأخرى تحمل هذا الاسم. اختر اسمًا مختلفًا.',
    alreadySaved: 'هذا موجود في مفضّلتك بالفعل.',
    duplicateNickname: 'عنصر مفضّل آخر يحمل هذا الاسم. اختر اسمًا مختلفًا.',
    savedLimitReached: 'حفظت أقصى عدد يسمح به الحساب من هذا النوع. أزل واحدًا لإفساح المجال.',
    savedItemNotFound: 'هذا لم يعد موجودًا. ربما أُزيل من قبل.',
    invalidToken: 'انتهت صلاحية هذا الرابط أو سبق استخدامه.',
    emailUnavailable: 'تعذّر إرسال الرسالة الآن. حاول مجددًا بعد بضع دقائق.',
    tooManyEmails:
      'أرسلنا عدة رسائل إلى هذا العنوان بالفعل. تحقق من بريدك الوارد ومجلد الرسائل غير المرغوب فيها، أو حاول لاحقًا.',
    emailNotVerified:
      'أكّد بريدك الإلكتروني أولًا: افتح الرابط الذي أرسلناه إليك عند التسجيل.',
  },

  nav: {
    sectionsLabel: 'الأقسام',
    primaryLabel: 'الرئيسية',
    skipToContent: 'تخطي إلى المحتوى',
    openMenu: 'القائمة',
    back: 'رجوع',
    closeMenu: 'إغلاق',
    home: 'الرئيسية',
    plan: 'مخطط الرحلات',
    routes: 'الخطوط',
    stops: 'المحطات',
    card: 'بطاقة السفر',
    favourites: 'المفضّلة',
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
    plan: { title: 'خطط رحلة', documentTitle: 'مخطط الرحلات' },
    routes: { title: 'الخطوط', documentTitle: 'الخطوط' },
    stops: { title: 'المحطات', documentTitle: 'المحطات' },
    card: { title: 'بطاقات السفر' },
    favourites: { title: 'المفضّلة', documentTitle: 'المفضّلة' },
    notFound: {
      title: 'الصفحة غير موجودة',
      body: 'لا يطابق هذا العنوان أي صفحة في الموقع. ربما تمّ نقلها، أو أن الرابط مكتوب خطأ.',
      backHome: 'الذهاب إلى الصفحة الرئيسية',
    },
  },
  planner: {
    origin: 'من',
    destination: 'إلى',
    originPlaceholder: 'عنوان أو مكان أو محطة',
    destinationPlaceholder: 'عنوان أو مكان أو محطة',
    swap: 'تبديل نقطة الانطلاق والوجهة',
    useMyLocation: 'استخدم موقعي',
    locating: 'جارٍ تحديد موقعك…',
    locationDenied: 'تمّ رفض إذن الموقع. ابحث عن مكان بدلاً من ذلك.',
    locationUnavailable: 'تعذّر تحديد موقعك. ابحث عن مكان بدلاً من ذلك.',
    myLocation: 'موقعي',
    date: 'التاريخ',
    time: 'الوقت',
    today: 'اليوم',
    tomorrow: 'غدًا',
    yesterday: 'أمس',
    chooseTime: 'اختر وقتًا',
    leaveNow: 'المغادرة الآن',
    hour: 'الساعة',
    minute: 'الدقيقة',
    meridiem: 'صباحًا أو مساءً',
    am: 'ص',
    pm: 'م',
    done: 'تم',
    walkingSpeed: 'سرعة المشي',
    speedSlow: 'بطيئة',
    speedCalm: 'هادئة',
    speedAverage: 'متوسطة',
    speedFast: 'سريعة',
    submit: 'ابحث عن رحلة',
    kmh: '{value} كم/س',
    searching: 'جارٍ البحث…',
    searchingHint: 'نبحث عن أفضل طريق عبر الشبكة.',
    suggestionsAvailable: {
      zero: 'لا توجد اقتراحات.',
      one: 'اقتراح واحد. استخدم مفاتيح الأسهم لاستعراضه.',
      two: 'اقتراحان. استخدم مفاتيح الأسهم لاستعراضهما.',
      few: '{count} اقتراحات. استخدم مفاتيح الأسهم لاستعراضها.',
      many: '{count} اقتراحًا. استخدم مفاتيح الأسهم لاستعراضها.',
      other: '{count} اقتراح. استخدم مفاتيح الأسهم لاستعراضها.',
    },
    searchUnavailable: 'البحث عن الأماكن غير متاح الآن. حاول بعد قليل.',
    isStop: 'محطة نقل عام',
    platform: 'الرصيف {platform}',
    track: 'المسار {platform}',
    chooseOrigin: 'اختر نقطة انطلاق من الاقتراحات.',
    chooseDestination: 'اختر وجهة من الاقتراحات.',
    noJourney: 'لم يُعثر على رحلة',
    noJourneyHint: 'لا يوجد ما يربط هذين المكانين في ذلك الوقت. جرّب وقتًا آخر، أو نقطة انطلاق قريبة.',
    resultsFound: {
      zero: 'لم يُعثر على رحلات.',
      one: 'تمّ العثور على رحلة واحدة.',
      two: 'تمّ العثور على رحلتين.',
      few: 'تمّ العثور على {count} رحلات.',
      many: 'تمّ العثور على {count} رحلة.',
      other: 'تمّ العثور على {count} رحلة.',
    },
    departAt: 'المغادرة',
    arriveAt: 'الوصول',
    totalDuration: 'الإجمالي',
    changes: {
      zero: 'بدون تبديل',
      one: 'تبديل واحد',
      two: 'تبديلان',
      few: '{count} تبديلات',
      many: '{count} تبديلاً',
      other: '{count} تبديل',
    },
    later: 'مغادرة لاحقا',
    noLater: 'لم يُعثر على رحلة أحدث.',
    walk: 'مشي',
    transitLeg: '{mode} {line}',
    towards: 'باتجاه {destination}',
    wait: 'انتظار {duration}',
    waitHere: 'انتظار {duration} في {place}',
    intermediateStops: {
      zero: 'لا توجد محطات في الطريق',
      one: 'محطة واحدة في الطريق',
      two: 'محطتان في الطريق',
      few: '{count} محطات في الطريق',
      many: '{count} محطة في الطريق',
      other: '{count} محطة في الطريق',
    },
    showStops: 'إظهار المحطات',
    hideStops: 'إخفاء المحطات',
    arrivesNextDay: 'الوصول {date}',
    departsOnDate: 'المغادرة {date}',
    walkOnly: 'المشي طوال الطريق أسرع من انتظار رحلة.',
    mapLabel: 'خريطة الرحلة',
    zoomIn: 'تكبير',
    zoomOut: 'تصغير',
    mapUnavailableTitle: 'لا يمكن عرض الخريطة هنا',
    mapUnavailableBody:
      'لا يدعم هذا المتصفّح الرسوميات التي تُرسم بها الخريطة. كل ما تعرضه الخريطة مذكور في القائمة المجاورة لها.',

    showOnMap: 'عرض هذه الرحلة على الخريطة',
    viewDetails: 'عرض هذه الرحلة خطوة بخطوة',
    backToResults: 'العودة إلى النتائج',
    journeyDetails: 'تفاصيل الرحلة',
    startPoint: 'الانطلاق',
    endPoint: 'الوجهة',
    selectedLocation: 'الموقع المحدَّد',
    dismiss: 'إغلاق',
    setAsOrigin: 'ابدأ من هنا',
    setAsDestination: 'انتهِ هنا',
    namingPlace: 'جارٍ التعرّف على هذا المكان…',
    totalWalking: 'مشي {duration} · {distance}',
    totalWaiting: 'انتظار {duration}',
    totalRiding: 'ركوب {duration}',
    journeySummary: 'المغادرة {start}، والوصول {end}، {duration}.',

    retryConnection: 'حاول مرة أخرى',
    checkingService: 'جارٍ التحقّق من خدمة تخطيط الرحلات…',
  },

  stops: {
    documentTitle: 'محطة {name}',
    documentTitleWithCode: 'محطة {name} · {code}',
    browseHint: 'كل محطة ظاهرة في الخريطة مدرجة هنا. اضغط إحداها لترى ما يغادرها.',
    nearMe: 'بالقرب مني',
    cityCentre: 'وسط المدينة',
    filterByMode: 'وسائل النقل',
    noMatchingStops: 'لا محطة ظاهرة تخدمها الوسائل التي أبقيتها مفعّلة. جرّب تحريك الخريطة أو إعادة تفعيل إحداها.',
    showAllModes: 'إظهار كل الوسائل',
    loadingStops: 'جارٍ البحث عن المحطات…',
    zoomInForStops: 'قرّب الخريطة لعرض المحطات',
    sampledStops:
      'المحطات هنا أكثر من أن تُعرض كاملة — هذه مجموعة مختارة منها. قرّب لرؤية البقية.',
    visibleStops: {
      zero: 'لا محطات ظاهرة',
      one: 'محطة واحدة ظاهرة',
      two: 'محطتان ظاهرتان',
      few: '{count} محطات ظاهرة',
      many: '{count} محطة ظاهرة',
      other: '{count} محطة ظاهرة',
    },
    noStopsHere: 'لا توجد محطات في هذا الجزء من الخريطة.',

    backToResults: 'العودة إلى النتائج',
    backToStops: 'العودة إلى المحطات',
    backToJourney: 'العودة إلى الرحلة',
    backToStop: 'العودة إلى المحطة',

    loadingStop: 'جارٍ تحميل المحطة…',

    stopCode: 'المحطة {code}',
    fareZone: 'المنطقة {zone}',
    wheelchairAccessible: 'وصول خالٍ من الدرجات',
    wheelchairNotAccessible: 'لا يوجد وصول خالٍ من الدرجات',
    wheelchairUnknown: 'لم تُذكر إمكانية الوصول',

    upcoming: 'القادمة',
    timetable: 'الجدول الزمني',
    viewLabel: 'ما الذي يُعرض',

    asOf: 'حتى الساعة {time}',
    inMinutes: {
      zero: 'الآن',
      one: 'دقيقة',
      two: 'دقيقتان',
      few: '{count} دقائق',
      many: '{count} دقيقة',
      other: '{count} دقيقة',
    },
    dueNow: 'الآن',
    departsIn: {
      zero: 'تغادر الآن',
      one: 'تغادر بعد دقيقة واحدة',
      two: 'تغادر بعد دقيقتين',
      few: 'تغادر بعد {count} دقائق',
      many: 'تغادر بعد {count} دقيقة',
      other: 'تغادر بعد {count} دقيقة',
    },
    noUpcoming: 'لا مزيد اليوم',
    noUpcomingHint: 'لا رحلات أخرى مجدولة من هذه المحطة. جرّب الجدول الزمني ليوم آخر.',
    boardAnnouncement: {
      zero: 'لا رحلات قادمة.',
      one: 'رحلة قادمة واحدة.',
      two: 'رحلتان قادمتان.',
      few: '{count} رحلات قادمة.',
      many: '{count} رحلة قادمة.',
      other: '{count} رحلة قادمة.',
    },

    towards: 'باتجاه {destination}',
    terminatesHere: 'تنتهي هنا',
    arrivesAt: 'تصل {time}',
    onDate: 'في {date}',

    date: 'التاريخ',
    departureCount: {
      zero: 'لا رحلات',
      one: 'رحلة واحدة',
      two: 'رحلتان',
      few: '{count} رحلات',
      many: '{count} رحلة',
      other: '{count} رحلة',
    },
    outsideTimetableRange: 'هذا التاريخ خارج نطاق الجدول الزمني',
    outsideTimetableRangeHint: 'تغطي البيانات المحمّلة نطاقًا محدّدًا من التواريخ. اختر تاريخًا ضمنه.',
    noDeparturesToday: 'لا شيء يمرّ بهذه المحطة في ذلك التاريخ.',

    filterByLine: 'الخطوط',
    clearFilter: 'إظهار كل الخطوط',
    noMatchingLines: 'لا رحلات تطابق الخطوط التي اخترتها.',

  },

  routes: {
    documentTitle: 'خط {line}',
    browseHint: 'اختر خطًّا لمعرفة مساره وأوقات تشغيله.',
    searchLines: 'ابحث في الخطوط',
    searchPlaceholder: 'الرقم أو الوجهة',
    noMatchingLines: 'لا خطوط تطابق هذا البحث.',
    clearSearch: 'إظهار كل الوسائل',
    lineCount: {
      zero: 'لا خطوط.',
      one: 'خط واحد.',
      two: 'خطّان.',
      few: '{count} خطوط.',
      many: '{count} خطًّا.',
      other: '{count} خط.',
    },
    variantCount: {
      zero: 'لا مسارات',
      one: 'مسار واحد',
      two: 'مساران',
      few: '{count} مسارات',
      many: '{count} مسارًا',
      other: '{count} مسار',
    },
    activeToday: 'يعمل اليوم',
    loadingLines: 'يجري تحميل الخطوط…',

    backToLines: 'كل الخطوط',
    backToLine: 'العودة إلى الخط',
    loadingLine: 'يجري تحميل الخط…',

    originToTerminus: 'من {origin} إلى {terminus}',
    flipDirection: 'اعرض الاتجاه الآخر',
    stopCount: {
      zero: 'لا محطات',
      one: 'محطة واحدة',
      two: 'محطتان',
      few: '{count} محطات',
      many: '{count} محطة',
      other: '{count} محطة',
    },
    tripCountToday: {
      zero: 'لا رحلات اليوم',
      one: 'رحلة واحدة اليوم',
      two: 'رحلتان اليوم',
      few: '{count} رحلات اليوم',
      many: '{count} رحلة اليوم',
      other: '{count} رحلة اليوم',
    },
    tripCountOnDate: {
      zero: 'لا رحلات في {date}',
      one: 'رحلة واحدة في {date}',
      two: 'رحلتان في {date}',
      few: '{count} رحلات في {date}',
      many: '{count} رحلة في {date}',
      other: '{count} رحلة في {date}',
    },
    spanToday: 'يعمل اليوم من {first} إلى {last}',
    spanOnDate: 'يعمل في {date} من {first} إلى {last}',
    notRunningToday: 'هذا الخط لا يعمل اليوم.',
    notRunningTodayHint: 'افتح الجدول لاختيار يوم يعمل فيه.',
    serviceRange: 'يعمل من {from} إلى {to}',
    noServiceDays: 'لا أيام تشغيل',

    alternativeRoutes: 'مسارات بديلة',
    showAlternatives: 'اعرض المسارات البديلة',
    hideAlternatives: 'أخفِ المسارات البديلة',
    currentVariant: 'المعروض الآن',
    runningNow: 'يعمل الآن',
    runsOnOtherDays: 'يعمل في أيام أخرى',
    startingLater: 'مستقبلية',
    noLongerRunning: 'لم يعد يعمل',
    towards: 'باتجاه {destination}',

    stopsView: 'المحطات',
    timetableView: 'الجدول',
    viewLabel: 'ما يُعرض عن هذا الخط',
    date: 'يوم التشغيل',

    inspectStop: 'افتح {stop}',
    nextDeparture: 'الرحلة القادمة',
    noMoreToday: 'لا مزيد اليوم',
    noCallHere: 'لا يتوقف ذلك اليوم',
    notOnThisRun: 'ليست ضمن هذه الرحلة',
    followingRun: 'تتبُّع رحلة واحدة من هذا الخط.',
    followingRunTowards: 'تتبُّع رحلة واحدة باتجاه {destination}.',
    showWholeLine: 'اعرض الخط كاملًا',
    followThisRun: 'تتبَّع رحلة هذه المركبة',
    vehicleHere: 'من المقرر وجود مركبة عند هذه المحطة الآن.',
    vehicleLeaving: 'من المقرر أن تكون مركبة في طريقها من هذه المحطة.',
    dayAnnouncement: {
      zero: 'لا رحلات في هذا اليوم.',
      one: 'رحلة واحدة في هذا اليوم.',
      two: 'رحلتان في هذا اليوم.',
      few: '{count} رحلات في هذا اليوم.',
      many: '{count} رحلة في هذا اليوم.',
      other: '{count} رحلة في هذا اليوم.',
    },

    fromStop: 'من',
    toStop: 'إلى',
    departs: 'المغادرة',
    arrives: 'الوصول',
    noOnwardStops: 'هذه آخر محطة على الخط، فلا وجهة أبعد منها. اختر محطة أسبق.',
    noTripsToday: 'هذا الخط لا يعمل في اليوم الذي اخترته.',
    outsideTimetableRange: 'خارج الجدول',
    outsideTimetableRangeHint: 'الجدول المحمَّل لا يمتد إلى ذلك التاريخ. اختر يومًا داخله.',
    tripsBetween: {
      zero: 'لا رحلات بين هاتين المحطتين.',
      one: 'رحلة واحدة بين هاتين المحطتين.',
      two: 'رحلتان بين هاتين المحطتين.',
      few: '{count} رحلات بين هاتين المحطتين.',
      many: '{count} رحلة بين هاتين المحطتين.',
      other: '{count} رحلة بين هاتين المحطتين.',
    },
    alreadyDeparted: 'غادرت',
  },

  card: {
    walletTitle: 'بطاقات السفر',
    walletIntro: 'أضف بطاقة، واشحنها، واطّلع على ما صُرف منها. البطاقات محفوظة في حسابك، فتظهر كما هي على كل جهاز تسجّل الدخول منه.',
    numberLabel: 'رقم البطاقة',

    addTitle: 'إضافة بطاقة',
    nicknameLabel: 'الاسم',
    nicknamePlaceholder: 'بطاقة المنزل، بطاقة العمل…',
    nicknameRequired: 'أعطِ البطاقة اسمًا.',
    typeLabel: 'النوع',
    types: {
      Standard: 'عادية',
      Student: 'طلابية',
      Elderly: 'كبار السن',
    },
    add: 'أضف البطاقة',
    adding: 'جارٍ الإضافة…',

    topUpLabel: 'مبلغ الشحن',
    topUpAction: 'اشحن',
    topUpPending: 'جارٍ الشحن…',
    fareLabel: 'مبلغ الأجرة',
    fareAction: 'ادفع الأجرة',
    farePending: 'جارٍ الدفع…',
    amountHint: 'تقبل المبالغ حتى {places} خانات عشرية، و{minimum} على الأقل.',
    amountRequired: 'أدخل المبلغ.',
    amountMalformed: 'أدخل المبلغ بالأرقام، بحد أقصى ثلاث خانات عشرية.',
    amountTooSmall: 'هذا المبلغ صغير جدًا.',

    discard: 'حذف البطاقة',
    discardTitle: 'هل تريد حذف {name}؟',
    discardWarning: 'ستُحذف البطاقة وكل ما سُجّل عليها نهائيًا. أدخل كلمة المرور للتأكيد.',
    discardPasswordLabel: 'كلمة المرور',
    discardNeedsEmpty: 'اصرف الرصيد المتبقّي أو انقله قبل حذف هذه البطاقة.',
    discardYes: 'احذف البطاقة',
    discardPending: 'جارٍ الحذف…',
    discardNo: 'إلغاء',

    balance: 'الرصيد',
    lastUsed: 'آخر استخدام {date}',
    neverUsed: 'لم تُستخدم بعد',
    emptyCard: 'هذه البطاقة فارغة. اشحنها قبل السفر.',
    balanceNow: 'الرصيد الآن {amount}.',

    activity: 'الحركات الأخيرة',
    fare: 'أجرة',
    topUp: 'شحن رصيد',
    noActivity: 'لا توجد حركات مسجّلة على هذه البطاقة بعد.',
    unknownPlace: 'رحلة',

    myCardsTitle: 'بطاقاتي',
    noCards: 'لا توجد بطاقات بعد. أضف واحدة وسيُصدَر رقمها لك.',
    loadingCards: 'جارٍ تحميل بطاقاتك…',
    limitReached: 'يمكنك الاحتفاظ بـ{count} بطاقات. احذف واحدة لإفساح المجال.',
    rename: 'إعادة التسمية',
    renameNamed: 'إعادة تسمية {name}',
    refreshBalance: 'تحديث الرصيد',
  },

  favourites: {
    add: 'أضف إلى المفضّلة',
    remove: 'أزل من المفضّلة',
    needsSearch: 'أكمل بيانات البحث قبل حفظه.',
    limitReached: 'يمكنك حفظ {count} من كل نوع. أزل واحدًا لإفساح المجال.',

    intro: 'كل ما حفظته، وما يغادر تاليًا.',
    savedToAccount: 'تُحفظ المفضّلة في حسابك.',
    loadingSaved: 'جارٍ تحميل ما حفظته…',
    noStops: 'لا محطات محفوظة. اضغط النجمة على محطة لحفظها هنا.',
    noRoutes: 'لا خطوط محفوظة. اضغط النجمة على خط لحفظه هنا.',
    noItineraries: 'لا رحلات محفوظة. أكمل بحثًا واضغط النجمة بجانبه.',
    groupStops: 'المحطات',
    groupRoutes: 'الخطوط',
    groupItineraries: 'الرحلات',
    countOfLimit: '{count} من {limit}',

    journeyRoute: 'من {origin} إلى {destination}',
    openJourney: 'ابحث عن هذه الرحلة الآن',
    paceLabel: 'المشي {pace}',

    rename: 'إعادة التسمية',
    renameNamed: 'إعادة تسمية {name}',
    renamePlaceholderStop: 'المنزل، العمل، المدرسة…',
    renamePlaceholderRoute: 'خط المطار، حافلة الليل…',
    renamePlaceholderItinerary: 'من المنزل إلى العمل، رحلة المدرسة…',
    openNamed: 'فتح {name}',
    moveEarlier: 'تحريك للأمام',
    moveLater: 'تحريك للخلف',
    dragHint: 'اسحب البطاقة لإعادة الترتيب، أو اضغط Alt مع مفاتيح الأسهم.',

    showEarlier: 'عرض المغادرات السابقة',
    showMore: 'عرض المغادرات التالية',

    journeyFallback: 'رحلة محفوظة',
    savedOn: 'حُفظت في {date}',
    fromLabel: 'من',
    toLabel: 'إلى',
    speedLabel: 'المشي',

    loadingDepartures: 'جارٍ تحميل المغادرات…',
    noDepartures: 'لا مزيد اليوم.',
    directionUnavailable: 'لم يعد هذا الاتجاه ضمن الجدول الزمني. افتح الخط لاختيار اتجاه آخر.',
    departuresUnavailable: 'يتعذّر تحميل المغادرات الآن.',
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
    submitting: 'لحظة واحدة…',
    switchToSignUp: 'ليس لديك حساب؟ أنشئ حسابًا',
    switchToLogIn: 'لديك حساب بالفعل؟ سجّل الدخول',
    nameRequired: 'أدخل اسمك.',
    nameInvalid: 'استخدم من 3 إلى 20 حرفًا أو رقمًا أو مسافة.',
    emailRequired: 'أدخل بريدك الإلكتروني.',
    emailInvalid: 'أدخل بريدًا إلكترونيًا مثل name@example.com.',
    passwordRequired: 'أدخل كلمة مرور.',
    passwordTooShort: 'استخدم 8 أحرف على الأقل.',
    forgot: 'إعادة تعيين كلمة المرور',
    forgotLink: 'نسيت كلمة المرور؟',
    forgotIntro: 'أدخل البريد الإلكتروني الذي سجّلت به وسنرسل إليك رابطًا لاختيار كلمة مرور جديدة.',
    submitForgot: 'إرسال رابط إعادة التعيين',
    forgotSent: 'إن كان هناك حساب للعنوان {email}، فإن رابط إعادة تعيين كلمة المرور في طريقه إليك. يعمل الرابط لمدة 10 دقائق.',
    backToLogIn: 'العودة إلى تسجيل الدخول',
    checkEmail:
      'اقتربت. أرسلنا رابطًا إلى {email}، افتحه لتأكيد عنوانك ثم سجّل الدخول. يعمل الرابط لمدة 24 ساعة.',
  },
  accountPage: {
    needsAccount:
      'سجّل الدخول لعرض حسابك أو تأكيد بريدك الإلكتروني أو تغيير كلمة المرور.',
    title:
      'حسابك',
    settingsLink:
      'إعدادات الحساب',
    details:
      'البيانات',
    name:
      'الاسم',
    email:
      'البريد الإلكتروني',
    changePassword:
      'تغيير كلمة المرور',
    currentPassword:
      'كلمة المرور الحالية',
    newPassword:
      'كلمة المرور الجديدة',
    submitChange:
      'تغيير كلمة المرور',
    changed:
      'تم تغيير كلمة المرور. سُجّل خروجك من أي أجهزة أخرى كنت مسجّل الدخول عليها.',
    wrongCurrent:
      'هذه ليست كلمة المرور الحالية.',
    forgotPrompt:
      'نسيت كلمة المرور الحالية؟ يمكننا إرسال رابط إليك لاختيار كلمة مرور جديدة.',
    sendResetLink:
      'أرسل لي رابط إعادة التعيين',
    resetSent:
      'رابط إعادة تعيين كلمة المرور في طريقه إلى {email}. يعمل الرابط لمدة 10 دقائق.',
  },
  verification: {
    verifyTitle:
      'تأكيد بريدك الإلكتروني',
    verifying:
      'جارٍ تأكيد بريدك الإلكتروني…',
    verified:
      'تم تأكيد بريدك الإلكتروني.',
    invalidLink:
      'انتهت صلاحية هذا الرابط أو سبق استخدامه.',
    missingToken:
      'تحتاج هذه الصفحة إلى الرابط الموجود في رسالتك.',
    goHome:
      'الانتقال إلى مخطط الرحلات',
    resetTitle:
      'اختيار كلمة مرور جديدة',
    resetIntro:
      'أدخل كلمة مرور جديدة لحسابك. يجب ألا تقل عن 8 أحرف.',
    newPassword:
      'كلمة المرور الجديدة',
    submitReset:
      'حفظ كلمة المرور الجديدة',
    resetDone:
      'تم تغيير كلمة المرور وأنت الآن مسجّل الدخول.',
    resetInvalidHint:
      'تعمل روابط إعادة التعيين مرة واحدة ولمدة 10 دقائق. اطلب رابطًا جديدًا واستخدم أحدث رسالة.',
    requestNewLink:
      'إرسال رابط إعادة تعيين جديد',
    resend:
      'إرسال رابط جديد',
    resending:
      'جارٍ الإرسال…',
    resent:
      'أُرسل. تحقق من بريدك الوارد.',
    verifiedHint:
      'حسابك جاهز. سجّل الدخول لتبدأ باستخدامه.',
    invalidVerifyHint:
      'تعمل روابط التأكيد لمدة 24 ساعة. حاول تسجيل الدخول وسنعرض عليك إرسال رابط جديد.',
    logIn:
      'تسجيل الدخول',
    verifiedTitle:
      'تم تأكيد البريد الإلكتروني',
    verifiedSignedInHint:
      'أنت مسجّل الدخول وجاهز للبدء.',
    linkExpiredTitle:
      'هذا الرابط لم يعد صالحًا',
    resetDoneTitle:
      'تم تغيير كلمة المرور',
    checkingLink:
      'جارٍ التحقق من الرابط…',
    missingTitle:
      'هذا الرابط غير مكتمل',
  },
  tour: {
    open: 'عرض الجولة',
    dialogLabel: 'جولة',
    stepOf: 'الخطوة {current} من {total}',
    next: 'التالي',
    back: 'السابق',
    done: 'تم',
    skip: 'تخطي الجولة',
    plan: {
      welcomeTitle: 'مرحبًا بك في مخطط الرحلات',
      welcomeBody:
        'نظرة سريعة على هذه الصفحة. تستغرق أقل من دقيقة، ويمكنك مشاهدتها مجددًا في أي وقت من زر ؟.',
      placesTitle: 'من أين وإلى أين',
      placesBody:
        'اكتب عنوانًا أو مكانًا أو اسم محطة واختر أحد الاقتراحات. زر التحديد يضع موقعك الحالي، والسهمان بجانب الحقلين يبدّلان بين البداية والنهاية.',
      whenTitle: 'وقت الانطلاق',
      whenBody:
        'اختر اليوم والوقت الذي تريد الانطلاق فيه. زر «المغادرة الآن» يملأ الاثنين معًا.',
      paceTitle: 'سرعة مشيك',
      paceBody:
        'تحدد سرعة مشيك أي التبديلات تلحق بها في الوقت، فاختر الأقرب إليك.',
      mapTitle: 'الخريطة',
      mapBody:
        'اضغط على أي مكان في الخريطة فتظهر هذه البطاقة: اختر «ابدأ من هنا» أو «انتهِ هنا» لاستخدام تلك النقطة. اضغط على محطة لترى ما يغادر منها. بعد البحث، اضغط على أحد خطوط الرحلة المرسومة لتتابع رحلة تلك المركبة.',
      resultsTitle: 'رحلاتك',
      resultsBody:
        'اضغط على الرحلة مرة لعرضها على الخريطة، ومرة أخرى لفتحها محطةً محطة. في داخلها، كل ركوب يفتح رحلة تلك المركبة كاملة. زر «مغادرة لاحقا» يجد المغادرات التي تليها.',
      saveTitle: 'احفظها لوقت لاحق',
      saveBody:
        'النجمة تحفظ هذا البحث في المفضلة، وللمحطات والخطوط نجمة أيضًا. يتطلب الحفظ حسابًا.',
      navTitle: 'كل ما عدا ذلك',
      navBody:
        'من هنا تتصفح الخطوط والمحطات، وتتابع بطاقة السفر، وتجد مفضلتك. على الهاتف أو الجهاز اللوحي تجدها في القائمة.',
    },
    itinerary: {
      stepsTitle: 'رحلتك خطوةً خطوة',
      stepsBody:
        'كل مشي وانتظار وركوب بالترتيب، مع وقت وصولك إلى كل محطة ووقت مغادرتك لها.',
      stopTitle: 'افتح محطة',
      stopBody:
        'اضغط على اسم محطة مسطّر لترى كل ما يغادر منها، وهذا مفيد لمعرفة الرصيف أو مغادرة لاحقة.',
      rideTitle: 'تابع الركوب',
      rideBody:
        'اضغط على الركوب لفتح رحلة تلك المركبة كاملة: كل محطة تتوقف فيها، وأين هي الآن. عدد المحطات تحته يعرض المحطات التي تمر بها في الطريق.',
      mapTitle: 'الرحلة على الخريطة',
      mapBody:
        'يُرسم كل ركوب بلونه الخاص، والمشي منقّط بينها. اضغط على خط ملوّن لتتابع تلك المركبة، أو على محطة لترى مغادراتها.',
      backTitle: 'العودة إلى القائمة',
      backBody:
        'عُد إلى كل الرحلات التي وُجدت لتقارن بينها أو تختار غيرها.',
    },
    routes: {
      searchTitle: 'ابحث عن خط',
      searchBody:
        'ابحث برقم الخط أو بوجهته، وضيّق القائمة حسب نوع المواصلات.',
      listTitle: 'كل خطوط الشبكة',
      listBody:
        'اضغط على خط لفتحه. يمكنك تغيير الاتجاه، ورؤية كل محطاته، وفتح جدوله، ومتابعة أماكن مركباته الآن.',
      mapTitle: 'الخطوط على الخريطة',
      mapBody:
        'يُرسم هنا الخط المفتوح مع مركباته في أماكنها الآن. اضغط على مركبة لتتابع رحلتها، أو على محطة لترى مغادراتها.',
      detailTitle:
        'داخل الخط',
      detailBody:
        'هذا ما يظهر عند فتح خط: غيّر الاتجاه من الأعلى، وشاهد كل محطة مع مغادرتها التالية، أو انتقل إلى الجدول لأي يوم. اضغط على محطة لترى مغادراتها.',
    },
    stops: {
      mapTitle: 'المحطات على الخريطة',
      mapBody:
        'حرّك الخريطة وقرّبها لتجد المحطات، فهي تظهر عند الاقتراب بما يكفي، وكل محطة ظاهرة مدرجة بجانبها.',
      nearbyTitle: 'محطات قريبة منك',
      nearbyBody:
        'انتقل مباشرة إلى المحطات من حولك، أو عد إلى وسط المدينة.',
      modesTitle: 'ما تستخدمه فقط',
      modesBody:
        'اعرض أنواع المواصلات التي تستخدمها فقط لتصبح الخريطة أسهل قراءة.',
      detailTitle:
        'لوحة المحطة',
      detailBody:
        'هذا ما يظهر عند فتح محطة: المغادرات القادمة مع الوقت المتبقي لكل منها، أو الجدول الكامل لأي يوم. صفِّ حسب الخط، واضغط على مغادرة لتتابع تلك المركبة.',
    },
    card: {
      introTitle: 'بطاقات السفر',
      introBody:
        'احتفظ ببطاقات السفر في مكان واحد. اضغط على بطاقة لترى رصيدها ونشاطها الأخير، أو لتشحنها، أو تدفع أجرة، أو تعيد تسميتها.',
      addTitle: 'أضف بطاقة',
      addBody:
        'هذا النموذج الذي يفتحه زر «إضافة بطاقة»: سمِّ البطاقة باسم تعرفه واختر نوعها، ويُصدر رقمها تلقائيًا.',
    },
    favourites: {
      introTitle: 'كل ما حفظته',
      introBody:
        'تظهر هنا المحطات والخطوط والرحلات التي ميّزتها بنجمة، مع ما يغادر قريبًا.',
      rowsTitle: 'رتّبها كما تحب',
      rowsBody:
        'اضغط على البطاقة لفتح المحطة أو الخط أو الرحلة المحفوظة، أو على اسمها لإعادة تسميتها. الأسهم الصغيرة تتنقل بين المغادرات و× يحذفها. اسحب النقاط لتضع ما تستخدمه أكثر أولًا.',
    },
  },
  account: {
    menuLabel: 'حسابك',
    signedInAs: 'مسجّل الدخول باسم',
    logOut: 'تسجيل الخروج',
    loggingOut: 'جارٍ تسجيل الخروج…',

    checking: 'جارٍ التحقق من حسابك…',
    unreachable: 'لم نتمكّن من الوصول إلى الخادم للتحقق من حسابك. حاول بعد قليل.',
    walletNeedsAccount: 'سجّل الدخول لترى بطاقات السفر الخاصة بك، ولشحنها، ولمعرفة ما صُرف منها.',
    favouritesNeedAccount: 'سجّل الدخول لترى المحطات والخطوط والرحلات التي حفظتها.',
    restNeedsNoAccount:
      'كل ما عدا ذلك يعمل دون حساب — خطّط رحلة، واستعرض المحطات والخطوط، وتابع أي جدول مواعيد.',
    saveNeedsAccount: 'سجّل الدخول لحفظ هذا.',
  },
};
