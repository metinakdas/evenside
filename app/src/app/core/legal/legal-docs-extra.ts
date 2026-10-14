/**
 * YASAL METİNLER — Almanca · Fransızca · İspanyolca · Arapça.
 *
 * Türkçe ve İngilizce asıl dosyada (`legal-docs.ts`); buradakiler onların çevirisi ve aynı
 * yapıyı taşır (başlık · güncelleme · giriş · bölümler). Ayrı dosyada tutuluyorlar ki asıl
 * dosya okunabilir kalsın ve yeni dil eklemek tek yere dokunmakla olsun.
 *
 * Metinler bilgilendirme amaçlıdır; yayına çıkmadan önce hukukçuya okutulmalı. Veri
 * sorumlusu bilgileri `VERI_SORUMLUSU` sabitinden gelir — uydurulmaz.
 */
import { LegalDoc, LegalDocId, VERI_SORUMLUSU } from './legal-common';

const iletisim = VERI_SORUMLUSU.eposta;
const kimlik = [VERI_SORUMLUSU.unvan, VERI_SORUMLUSU.adres, VERI_SORUMLUSU.eposta];

const de: Record<LegalDocId, LegalDoc> = {
  gizlilik: {
    title: 'Datenschutzerklärung',
    updated: '22. September 2026',
    intro:
      'Evenside ist eine Web-App zum Zusammenstellen von Kleinfeld-Kadern. Hier steht, welche Daten wir erheben, warum und wie lange wir sie speichern.',
    sections: [
      {
        heading: 'Welche Daten',
        body: [
          '- **Kontodaten:** E-Mail-Adresse und ein Hash deines Passworts. Passwörter werden nie im Klartext gespeichert.',
          '- **Spielerkarte:** Name, Größe, Gewicht, Fähigkeitswerte und optional ein Foto. Das Freistellen des Fotos läuft IM BROWSER; dafür wird nichts hochgeladen.',
          '- **Team- und Kaderdaten:** Teamname, Beitrittscode, Kaderzusammensetzung.',
          '- **Nur auf deinem Gerät:** Spielverlauf, aktives Team und Zeremonie-Einstellungen liegen im lokalen Speicher des Browsers.',
          'Keine Werbe-, Standort- oder Kontaktdaten.',
        ],
      },
      {
        heading: 'Zweck',
        body: [
          'Die Daten dienen ausschließlich dem Betrieb: Konto, Kartenberechnung, Team- und Kaderverwaltung, Auslosung und Erzeugung des Aufstellungsbilds.',
          'Wir verkaufen keine Daten und geben sie nicht zu Marketingzwecken weiter.',
        ],
      },
      {
        heading: 'Empfänger',
        body: [
          '- **Supabase** — Hosting von Datenbank und Anmeldung.',
          '- **TheSportsDB** — Vereinswappen und Trikots; übermittelt wird nur der von dir gewählte Vereinsname.',
          '- **images.weserv.nl** — Bild-Proxy, damit Vereinsgrafiken in den PNG-Export gezeichnet werden können.',
        ],
      },
      {
        heading: 'Speicherdauer',
        body: [
          'Solange dein Konto besteht. Beim Löschen des Kontos werden deine Karte, deine Teams und deren Kader gelöscht; Einträge in fremden Teams werden von dir entkoppelt.',
        ],
      },
      {
        heading: 'Sicherheit',
        body: [
          'Übertragung per HTTPS. In der Datenbank gelten Row-Level-Security-Regeln: Du siehst nur deine eigenen und die Teams, in denen du Mitglied bist.',
        ],
      },
      { heading: 'Kontakt', body: kimlik },
    ],
  },
  kvkk: {
    title: 'Datenschutzhinweis (DSGVO / KVKK)',
    updated: '22. September 2026',
    intro:
      'Dieser Hinweis erklärt die Verarbeitung personenbezogener Daten nach Art. 13 DSGVO und Art. 10 des türkischen KVKK.',
    sections: [
      { heading: 'Verantwortlicher', body: kimlik },
      {
        heading: 'Datenkategorien',
        body: [
          '- Identität und Kontakt: E-Mail-Adresse, Anzeigename.',
          '- Nutzungsdaten: Werte der Spielerkarte, Teams, Kader, Spielaufzeichnungen.',
          '- Bilddaten: optionales Spielerfoto.',
        ],
      },
      { heading: 'Zwecke', body: ['Kontoerstellung und Anmeldung, Erbringung des Dienstes, Sicherheit und Missbrauchsvermeidung.'] },
      {
        heading: 'Rechtsgrundlagen',
        body: ['Vertragserfüllung (Art. 6 Abs. 1 lit. b), berechtigte Interessen (lit. f) und – wo erforderlich – Einwilligung (lit. a).'],
      },
      {
        heading: 'Übermittlung',
        body: ['Die Daten werden bei Supabase verarbeitet; die Infrastruktur kann außerhalb deines Landes liegen.'],
      },
      {
        heading: 'Deine Rechte',
        body: [
          '- Auskunft, Berichtigung und Löschung.',
          '- Einschränkung und Widerspruch.',
          '- Datenübertragbarkeit.',
          '- Beschwerde bei einer Aufsichtsbehörde.',
          `Schreib an ${iletisim}. Du kannst dein Konto auch selbst löschen (Konto → Konto löschen).`,
        ],
      },
    ],
  },
  cerez: {
    title: 'Cookie-Richtlinie',
    updated: '22. September 2026',
    intro: 'Evenside nutzt keine klassischen Cookies, sondern den lokalen Speicher deines Browsers.',
    sections: [
      {
        heading: 'Unbedingt erforderlich',
        body: [
          '- **Sitzungsschlüssel** (`sb-…-auth-token`): hält dich angemeldet.',
          '- **Kader und Einstellungen** (`saha42.*`): bleiben auf deinem Gerät.',
          '- **Einwilligung** (`saha42.cerez.v1`): merkt sich deine Auswahl.',
        ],
      },
      {
        heading: 'Optional',
        body: ['Derzeit keine Analyse-, Werbe- oder Tracking-Werkzeuge. Kommen welche hinzu, wirst du vorher gefragt.'],
      },
      { heading: 'Löschen', body: ['Website-Daten im Browser löschen. Danach bist du abgemeldet und lokale Einträge sind weg.'] },
    ],
  },
  kosullar: {
    title: 'Nutzungsbedingungen',
    updated: '22. September 2026',
    intro: 'Mit der Nutzung von Evenside akzeptierst du diese Bedingungen.',
    sections: [
      {
        heading: 'Dienst',
        body: [
          'Evenside ist kostenlos: Spielerkarten, Team- und Kaderverwaltung, ausgeglichene Auslosung, Aufstellungsbild.',
          'Der Dienst wird „wie besehen“ bereitgestellt; ein störungsfreier Betrieb wird nicht garantiert.',
        ],
      },
      {
        heading: 'Dein Konto',
        body: ['Du bist für die Sicherheit deines Kontos verantwortlich. Teile dein Passwort nicht.'],
      },
      {
        heading: 'Inhalte',
        body: [
          'Du musst die Rechte an Namen, Fotos und Teamangaben besitzen. Beleidigungen, Hassrede und das Teilen fremder personenbezogener Daten sind untersagt.',
          'Vereinswappen und Trikots stammen von Dritten; Markenrechte liegen bei den Inhabern.',
        ],
      },
      { heading: 'Haftung', body: ['Kader- und Auslosungsergebnisse sind Vorschläge. Für Ergebnisse, Streitigkeiten oder Datenverlust wird keine Haftung übernommen.'] },
      { heading: 'Kontakt', body: [iletisim] },
    ],
  },
};

const fr: Record<LegalDocId, LegalDoc> = {
  gizlilik: {
    title: 'Politique de confidentialité',
    updated: '22 septembre 2026',
    intro:
      'Evenside est une application web pour composer des effectifs de football à cinq. Cette page explique quelles données sont collectées, pourquoi et combien de temps.',
    sections: [
      {
        heading: 'Données collectées',
        body: [
          '- **Compte :** adresse e-mail et empreinte (hash) du mot de passe. Aucun mot de passe en clair.',
          '- **Carte joueur :** nom, taille, poids, notes et photo facultative. Le détourage se fait DANS LE NAVIGATEUR ; la photo n’est pas envoyée pour cette étape.',
          '- **Équipe et effectif :** nom de l’équipe, code d’invitation, composition.',
          '- **Sur votre appareil :** historique des matchs, équipe active et préférences restent en stockage local.',
          'Aucune donnée publicitaire, de localisation ou de contacts.',
        ],
      },
      {
        heading: 'Finalités',
        body: [
          'Les données servent uniquement au service : compte, calcul de la carte, gestion des équipes et effectifs, tirage équilibré, image de composition.',
          'Nous ne vendons pas vos données et ne les partageons pas à des fins marketing.',
        ],
      },
      {
        heading: 'Destinataires',
        body: [
          '- **Supabase** — hébergement de la base et de l’authentification.',
          '- **TheSportsDB** — écussons et maillots ; seul le nom du club choisi est transmis.',
          '- **images.weserv.nl** — proxy d’images pour l’export PNG.',
        ],
      },
      {
        heading: 'Conservation',
        body: [
          'Tant que votre compte existe. La suppression du compte efface votre carte, vos équipes et leurs effectifs ; les enregistrements laissés dans l’équipe d’autrui sont dissociés de vous.',
        ],
      },
      { heading: 'Sécurité', body: ['HTTPS et sécurité au niveau des lignes (RLS) en base : vous n’accédez qu’à vos équipes et à celles dont vous êtes membre.'] },
      { heading: 'Contact', body: kimlik },
    ],
  },
  kvkk: {
    title: 'Information sur la protection des données (RGPD / KVKK)',
    updated: '22 septembre 2026',
    intro: 'Cette note explique le traitement des données personnelles au sens de l’art. 13 du RGPD et de l’art. 10 de la loi turque KVKK.',
    sections: [
      { heading: 'Responsable du traitement', body: kimlik },
      {
        heading: 'Catégories de données',
        body: [
          '- Identité et contact : adresse e-mail, nom affiché.',
          '- Données d’usage : valeurs de la carte, équipes, effectifs, matchs.',
          '- Image : photo facultative.',
        ],
      },
      { heading: 'Finalités', body: ['Création de compte et authentification, fourniture du service, sécurité et prévention des abus.'] },
      { heading: 'Bases légales', body: ['Exécution du contrat (art. 6.1.b), intérêt légitime (art. 6.1.f) et, si nécessaire, consentement (art. 6.1.a).'] },
      { heading: 'Transferts', body: ['Les données sont hébergées chez Supabase, dont l’infrastructure peut se situer hors de votre pays.'] },
      {
        heading: 'Vos droits',
        body: [
          '- Accès, rectification, effacement.',
          '- Limitation et opposition.',
          '- Portabilité.',
          '- Réclamation auprès d’une autorité de contrôle.',
          `Écrivez à ${iletisim}. Vous pouvez aussi supprimer votre compte vous-même (Compte → Supprimer le compte).`,
        ],
      },
    ],
  },
  cerez: {
    title: 'Politique de cookies',
    updated: '22 septembre 2026',
    intro: 'Evenside n’utilise pas de cookies classiques mais le stockage local du navigateur.',
    sections: [
      {
        heading: 'Strictement nécessaires',
        body: [
          '- **Clé de session** (`sb-…-auth-token`) : vous garde connecté.',
          '- **Effectif et préférences** (`saha42.*`) : restent sur votre appareil.',
          '- **Consentement** (`saha42.cerez.v1`) : mémorise votre choix.',
        ],
      },
      { heading: 'Optionnels', body: ['Aucun outil d’analyse, de publicité ou de suivi aujourd’hui. Si cela change, votre accord sera demandé avant.'] },
      { heading: 'Suppression', body: ['Effacez les données du site dans votre navigateur : vous serez déconnecté et les enregistrements locaux disparaîtront.'] },
    ],
  },
  kosullar: {
    title: 'Conditions d’utilisation',
    updated: '22 septembre 2026',
    intro: 'En utilisant Evenside, vous acceptez ces conditions.',
    sections: [
      {
        heading: 'Le service',
        body: [
          'Evenside est gratuit : cartes de joueurs, gestion d’équipes et d’effectifs, tirage équilibré, image de composition.',
          'Le service est fourni « en l’état » ; aucun fonctionnement ininterrompu n’est garanti.',
        ],
      },
      { heading: 'Votre compte', body: ['Vous êtes responsable de la sécurité de votre compte. Ne partagez pas votre mot de passe.'] },
      {
        heading: 'Contenus',
        body: [
          'Vous devez détenir les droits sur les noms, photos et informations d’équipe publiés. Insultes, haine et partage de données personnelles d’autrui sont interdits.',
          'Écussons et maillots proviennent de sources tierces ; les marques appartiennent à leurs titulaires.',
        ],
      },
      { heading: 'Responsabilité', body: ['Les résultats de tirage sont des suggestions. Aucune responsabilité pour les résultats sur le terrain, les litiges ou la perte de données.'] },
      { heading: 'Contact', body: [iletisim] },
    ],
  },
};

const es: Record<LegalDocId, LegalDoc> = {
  gizlilik: {
    title: 'Política de privacidad',
    updated: '22 de septiembre de 2026',
    intro:
      'Evenside es una aplicación web para formar plantillas de fútbol 5/7. Aquí explicamos qué datos recogemos, por qué y durante cuánto tiempo.',
    sections: [
      {
        heading: 'Datos que recogemos',
        body: [
          '- **Cuenta:** correo electrónico y un hash de tu contraseña. Nunca se guarda en texto plano.',
          '- **Carta de jugador:** nombre, altura, peso, valoraciones y foto opcional. El recorte del fondo ocurre EN TU NAVEGADOR; la foto no se sube para ese paso.',
          '- **Equipo y plantilla:** nombre del equipo, código de acceso, composición.',
          '- **En tu dispositivo:** historial de partidos, equipo activo y preferencias quedan en el almacenamiento local.',
          'No recogemos datos de publicidad, ubicación ni agenda.',
        ],
      },
      {
        heading: 'Para qué',
        body: [
          'Solo para prestar el servicio: cuenta, cálculo de la carta, gestión de equipos y plantillas, sorteo equilibrado e imagen de alineación.',
          'No vendemos tus datos ni los compartimos con fines de marketing.',
        ],
      },
      {
        heading: 'Con quién se comparten',
        body: [
          '- **Supabase** — alojamiento de base de datos y autenticación.',
          '- **TheSportsDB** — escudos y equipaciones; solo se consulta el nombre del club elegido.',
          '- **images.weserv.nl** — proxy de imágenes para la exportación PNG.',
        ],
      },
      {
        heading: 'Conservación',
        body: [
          'Mientras exista tu cuenta. Al eliminarla se borran tu carta, tus equipos y sus plantillas; los registros dejados en equipos ajenos se desvinculan de ti.',
        ],
      },
      { heading: 'Seguridad', body: ['HTTPS y seguridad a nivel de fila (RLS) en la base de datos: solo ves tus equipos y aquellos de los que eres miembro.'] },
      { heading: 'Contacto', body: kimlik },
    ],
  },
  kvkk: {
    title: 'Aviso de protección de datos (RGPD / KVKK)',
    updated: '22 de septiembre de 2026',
    intro: 'Este aviso explica el tratamiento de datos personales conforme al art. 13 del RGPD y al art. 10 de la ley turca KVKK.',
    sections: [
      { heading: 'Responsable', body: kimlik },
      {
        heading: 'Categorías de datos',
        body: [
          '- Identidad y contacto: correo electrónico, nombre mostrado.',
          '- Datos de uso: valores de la carta, equipos, plantillas y partidos.',
          '- Imagen: foto opcional.',
        ],
      },
      { heading: 'Finalidades', body: ['Creación de cuenta y autenticación, prestación del servicio, seguridad y prevención de abusos.'] },
      { heading: 'Bases jurídicas', body: ['Ejecución del contrato (art. 6.1.b), interés legítimo (art. 6.1.f) y, cuando proceda, consentimiento (art. 6.1.a).'] },
      { heading: 'Transferencias', body: ['Los datos se alojan en Supabase, cuya infraestructura puede estar fuera de tu país.'] },
      {
        heading: 'Tus derechos',
        body: [
          '- Acceso, rectificación y supresión.',
          '- Limitación y oposición.',
          '- Portabilidad.',
          '- Reclamación ante la autoridad de control.',
          `Escribe a ${iletisim}. También puedes eliminar tu cuenta tú mismo (Cuenta → Eliminar cuenta).`,
        ],
      },
    ],
  },
  cerez: {
    title: 'Política de cookies',
    updated: '22 de septiembre de 2026',
    intro: 'Evenside no usa cookies clásicas, sino el almacenamiento local del navegador.',
    sections: [
      {
        heading: 'Estrictamente necesarias',
        body: [
          '- **Clave de sesión** (`sb-…-auth-token`): te mantiene con la sesión iniciada.',
          '- **Plantilla y preferencias** (`saha42.*`): no salen de tu dispositivo.',
          '- **Consentimiento** (`saha42.cerez.v1`): recuerda tu elección.',
        ],
      },
      { heading: 'Opcionales', body: ['Hoy no hay herramientas de analítica, publicidad ni rastreo. Si se añaden, se pedirá tu permiso antes.'] },
      { heading: 'Cómo borrarlas', body: ['Borra los datos del sitio en tu navegador: se cerrará la sesión y desaparecerán los registros locales.'] },
    ],
  },
  kosullar: {
    title: 'Condiciones de uso',
    updated: '22 de septiembre de 2026',
    intro: 'Al usar Evenside aceptas estas condiciones.',
    sections: [
      {
        heading: 'El servicio',
        body: [
          'Evenside es gratuito: cartas de jugador, gestión de equipos y plantillas, sorteo equilibrado e imagen de alineación.',
          'El servicio se presta «tal cual»; no se garantiza un funcionamiento ininterrumpido.',
        ],
      },
      { heading: 'Tu cuenta', body: ['Eres responsable de la seguridad de tu cuenta. No compartas tu contraseña.'] },
      {
        heading: 'Contenido',
        body: [
          'Debes tener derechos sobre los nombres, fotos y datos de equipo que subas. Se prohíben insultos, discurso de odio y compartir datos personales ajenos.',
          'Escudos y equipaciones provienen de terceros; las marcas pertenecen a sus titulares.',
        ],
      },
      { heading: 'Responsabilidad', body: ['Los resultados del sorteo son sugerencias. No se asume responsabilidad por resultados, disputas o pérdida de datos.'] },
      { heading: 'Contacto', body: [iletisim] },
    ],
  },
};

const ar: Record<LegalDocId, LegalDoc> = {
  gizlilik: {
    title: 'سياسة الخصوصية',
    updated: '٢٢ سبتمبر ٢٠٢٦',
    intro:
      'Evenside تطبيق ويب لتكوين تشكيلات كرة القدم الخماسية. توضح هذه الصفحة البيانات التي نجمعها وسببها ومدة حفظها.',
    sections: [
      {
        heading: 'البيانات التي نجمعها',
        body: [
          '- **بيانات الحساب:** البريد الإلكتروني وبصمة مشفّرة لكلمة المرور. لا تُحفظ كلمات المرور كنص صريح.',
          '- **بطاقة اللاعب:** الاسم والطول والوزن ودرجات المهارة وصورة اختيارية. تتم إزالة خلفية الصورة داخل المتصفح ولا تُرفع إلى أي خادم لهذه الخطوة.',
          '- **بيانات الفريق والتشكيلة:** اسم الفريق ورمز الانضمام وأعضاء التشكيلة.',
          '- **بيانات تبقى على جهازك:** سجل المباريات والفريق النشط والتفضيلات تُحفظ في التخزين المحلي للمتصفح.',
          'لا نجمع بيانات إعلانية أو بيانات موقع أو جهات اتصال.',
        ],
      },
      {
        heading: 'أغراض المعالجة',
        body: [
          'تُستخدم البيانات لتشغيل الخدمة فقط: إنشاء الحساب، حساب البطاقة، إدارة الفرق والتشكيلات، القرعة المتوازنة وإنتاج صورة التشكيلة.',
          'لا نبيع بياناتك ولا نشاركها لأغراض تسويقية.',
        ],
      },
      {
        heading: 'الجهات المستقبِلة',
        body: [
          '- **Supabase** — استضافة قاعدة البيانات والمصادقة.',
          '- **TheSportsDB** — شعارات الأندية والأطقم؛ يُرسل اسم النادي الذي تختاره فقط.',
          '- **images.weserv.nl** — وسيط للصور ليتم رسمها في ملف PNG المُصدَّر.',
        ],
      },
      {
        heading: 'مدة الحفظ',
        body: [
          'تُحفظ البيانات ما دام حسابك قائمًا. عند حذف الحساب تُحذف بطاقتك وفرقك وتشكيلاتها، وتُفصل السجلات المتروكة في فرق الآخرين عنك.',
        ],
      },
      { heading: 'الأمان', body: ['الاتصال مشفّر عبر HTTPS، وتطبّق قاعدة البيانات أمان مستوى الصف: لا يمكنك الاطلاع على سجلات خارج فرقك.'] },
      { heading: 'التواصل', body: kimlik },
    ],
  },
  kvkk: {
    title: 'إشعار حماية البيانات (GDPR / KVKK)',
    updated: '٢٢ سبتمبر ٢٠٢٦',
    intro: 'يوضح هذا الإشعار معالجة البيانات الشخصية وفق المادة ١٣ من اللائحة الأوروبية والمادة ١٠ من قانون KVKK التركي.',
    sections: [
      { heading: 'المسؤول عن البيانات', body: kimlik },
      {
        heading: 'فئات البيانات',
        body: [
          '- الهوية والتواصل: البريد الإلكتروني والاسم الظاهر.',
          '- بيانات الاستخدام: قيم البطاقة والفرق والتشكيلات وسجلات المباريات.',
          '- بيانات الصورة: صورة اختيارية.',
        ],
      },
      { heading: 'الأغراض', body: ['إنشاء الحساب والمصادقة، تقديم الخدمة، حمايتها ومنع إساءة الاستخدام.'] },
      { heading: 'الأساس القانوني', body: ['تنفيذ العقد، والمصلحة المشروعة، والموافقة عند الاقتضاء.'] },
      { heading: 'النقل', body: ['تُعالج البيانات على بنية Supabase وقد تكون خارج بلدك.'] },
      {
        heading: 'حقوقك',
        body: [
          '- الاطلاع والتصحيح والحذف.',
          '- تقييد المعالجة والاعتراض عليها.',
          '- نقل البيانات.',
          '- تقديم شكوى إلى الجهة الرقابية.',
          `للتواصل: ${iletisim}. يمكنك أيضًا حذف حسابك بنفسك (حسابي ← حذف الحساب).`,
        ],
      },
    ],
  },
  cerez: {
    title: 'سياسة ملفات الارتباط',
    updated: '٢٢ سبتمبر ٢٠٢٦',
    intro: 'لا يستخدم Evenside ملفات ارتباط تقليدية، بل التخزين المحلي في متصفحك.',
    sections: [
      {
        heading: 'ضرورية دائمًا',
        body: [
          '- **مفتاح الجلسة** (`sb-…-auth-token`): يبقيك مسجّل الدخول.',
          '- **التشكيلة والتفضيلات** (`saha42.*`): لا تغادر جهازك.',
          '- **سجل الموافقة** (`saha42.cerez.v1`): يتذكّر اختيارك.',
        ],
      },
      { heading: 'اختيارية', body: ['لا توجد اليوم أدوات تحليل أو إعلان أو تتبّع. إن أُضيفت فسنطلب موافقتك أولًا.'] },
      { heading: 'كيفية الحذف', body: ['امسح بيانات الموقع من إعدادات المتصفح؛ سيتم تسجيل خروجك وتُحذف السجلات المحلية.'] },
    ],
  },
  kosullar: {
    title: 'شروط الاستخدام',
    updated: '٢٢ سبتمبر ٢٠٢٦',
    intro: 'باستخدامك Evenside فإنك توافق على الشروط التالية.',
    sections: [
      {
        heading: 'الخدمة',
        body: [
          'Evenside خدمة مجانية: بطاقات اللاعبين، إدارة الفرق والتشكيلات، قرعة متوازنة وصورة التشكيلة.',
          'تُقدَّم الخدمة «كما هي» دون ضمان عملها دون انقطاع أو أخطاء.',
        ],
      },
      { heading: 'حسابك', body: ['أنت مسؤول عن أمان حسابك؛ لا تشارك كلمة المرور.'] },
      {
        heading: 'المحتوى والسلوك',
        body: [
          'يجب أن تملك حقوق الأسماء والصور وبيانات الفريق التي ترفعها. يُمنع السبّ وخطاب الكراهية ومشاركة بيانات الآخرين دون إذن.',
          'شعارات الأندية وأطقمها من مصادر خارجية، وحقوق العلامات لأصحابها.',
        ],
      },
      { heading: 'حدود المسؤولية', body: ['نتائج القرعة اقتراحات. لا نتحمّل مسؤولية النتائج في الملعب أو الخلافات أو فقدان البيانات.'] },
      { heading: 'التواصل', body: [iletisim] },
    ],
  },
};

export const EXTRA_LEGAL_DOCS: Record<string, Record<LegalDocId, LegalDoc>> = { de, fr, es, ar };
