/* The church photos shown on the Visit page.
   To change them: drop new files into public/photos, keep the same names,
   and edit the captions below. Nothing else needs touching. */

/* pos nudges the crop so faces are not cut off on a square frame */
export const PHOTOS = [
  { n: "01", caption: "Pastor Vwakpor, mid-message", pos: "72% 40%" },
  { n: "02", caption: "Sunday worship", pos: "50% 45%" },
  { n: "03", caption: "Pastor leads worship", pos: "44% 32%" },
  { n: "04", caption: "Everybody prays", pos: "58% 45%" },
  { n: "05", caption: "Ministering at the altar", pos: "42% 45%" },
  { n: "06", caption: "Quiet before God", pos: "46% 38%" },
  { n: "07", caption: "Standing together", pos: "50% 38%" },
  { n: "08", caption: "Hands up, all the way", pos: "52% 34%" },
  { n: "09", caption: "Crying out", pos: "46% 40%" },
  { n: "10", caption: "Connecting with God", pos: "52% 42%" },
  { n: "11", caption: "The little Dead Raisers", pos: "42% 45%" },
].map((p) => ({
  ...p,
  src: `/photos/photo-${p.n}.jpg`,
  thumb: `/photos/thumb-${p.n}.jpg`,
}));

export const CHURCH = {
  address: [
    "25 Igbineweka Street",
    "Beside Tricia International School",
    "Off Ekosodin Road, Evbuomore",
    "Benin City",
  ],
  services: [
    { day: "Sunday", time: "11:00 am" },
    { day: "Monday", time: "4:30 pm" },
    { day: "Tuesday", time: "4:30 pm" },
  ],
  phone: "0902 335 0524",
  phoneDial: "+2349023350524",
  maps: "https://maps.app.goo.gl/oDBeYtkdui84hpuB9",
  telegram: "https://t.me/Dead_Raisers",
  telegramHandle: "t.me/Dead_Raisers",
};
