/* =========================================================
   POLY — настройки сайта
   Здесь меняется то, что видит посетитель в полоске статуса
   и на кнопках покупки.
   ========================================================= */

window.POLY_CONFIG = {
  /* Ссылка для покупки курсов: Boosty или Telegram. */
  buyUrl: 'https://boosty.to/YOUR-PAGE',

  /* Firebase Realtime Database: онлайн, посещения, заявки.
     Значения берутся из Project settings → Your apps → Web app. */
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'poly-45ad7.firebaseapp.com',
    databaseURL: 'https://poly-45ad7-default-rtdb.firebaseio.com',
    projectId: 'poly-45ad7'
  },

  /* Статус сайта: 'ok' | 'maintenance' | 'down'.
     Можно менять здесь или в базе (узел status). */
  status: 'ok',
  statusNote: ''
};
