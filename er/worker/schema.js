// Single source of truth for every shared collection: table name + whitelisted, typed fields.
// The generic API (routes/data.js) validates every write against this; migrations are generated from it
// (node scripts/gen-schema.mjs).
//
// Field types: str (≤300) · text (≤5000) · date · time · datetime · month · int · num · bool · url · file
//              json · user (a user id or 'both') · [enum values]
// Every table also gets: id, created_by, updated_by, created_at, updated_at.

const REMIND = { remind: ['', '0', '1', '3', '7', 'custom'], remind_at: 'datetime' };
const PRIORITY = ['low', 'medium', 'high'];

export const COLLECTIONS = {
  dates: {
    label: 'مناسبة',
    required: ['title', 'date'],
    fields: { title: 'str', date: 'date', cal: ['g', 'h'], h_year: 'int', h_month: 'int', h_day: 'int', recurring: 'bool', kind: ['birthday', 'engagement', 'anniversary', 'first', 'family', 'special', 'other'], description: 'text', note: 'text', image_id: 'file', ...REMIND },
  },
  events: {
    label: 'موعد',
    required: ['title', 'date'],
    fields: { title: 'str', type: ['event', 'appointment', 'occasion'], date: 'date', end_date: 'date', time: 'time', end_time: 'time', assignee: 'user', location: 'str', notes: 'text', source_col: 'str', source_id: 'str', ...REMIND },
  },
  tasks: {
    label: 'مهمة',
    required: ['title'],
    fields: { title: 'str', description: 'text', assignee: 'user', due_date: 'date', priority: PRIORITY, status: ['pending', 'in_progress', 'completed', 'delayed'], notes: 'text', attachment_id: 'file', attachment_name: 'str', completed_at: 'str', completed_by: 'str', ...REMIND },
  },
  task_comments: {
    label: 'تعليق',
    required: ['task_id', 'body'],
    parent: { col: 'tasks', key: 'task_id' },
    fields: { task_id: 'str', body: 'text' },
  },
  plans: {
    label: 'خطة',
    required: ['title', 'month'],
    fields: { month: 'month', title: 'str', date: 'date', assignee: 'user', priority: PRIORITY, status: ['not_started', 'in_progress', 'completed', 'postponed'], description: 'text', notes: 'text', link: 'url', image_id: 'file', ...REMIND },
  },
  moods: {
    label: 'مزاج',
    required: ['date', 'mood'],
    ownerWrite: true,              // only the author can edit/delete
    privateFields: ['private_note'], // never sent to the partner
    unique: ['created_by', 'date'],
    fields: { date: 'date', mood: ['happy', 'calm', 'great', 'okay', 'upset', 'tired', 'annoyed', 'need_care', 'thinking'], message: 'str', needs: 'str', energy: 'int', private_note: 'text' },
  },
  cycles: {
    label: 'دورة',
    required: ['start_date'],
    ownerOnly: true,               // invisible to the partner, excluded from sync/export for them
    fields: { start_date: 'date', end_date: 'date', flow: ['', 'light', 'medium', 'heavy'], symptoms: 'json', mood: 'str', pain: 'int', notes: 'text' },
  },
  places: {
    label: 'مكان',
    required: ['name'],
    fields: { name: 'str', category: ['restaurant', 'cafe', 'dessert', 'activity', 'new', 'favorite'], image_id: 'file', maps_url: 'url', location: 'str', cuisine: 'str', price: 'int', rating: 'int', notes: 'text', to_try: 'text', visited: 'bool', visit_date: 'date', favorite: 'bool', photos: 'json', lat: 'geo', lng: 'geo' },
  },
  bucket: {
    label: 'أمنية',
    required: ['title'],
    fields: { title: 'str', image_id: 'file', url: 'url', description: 'text', cost: 'num', suggested_date: 'date', status: ['wishlist', 'planned', 'done'], event_id: 'str', done_date: 'date' },
  },
  trips: {
    label: 'رحلة',
    required: ['name'],
    fields: { name: 'str', destination: 'str', start_date: 'date', end_date: 'date', budget: 'num', hotel_url: 'url', flight_url: 'url', flight_details: 'text', hotel_details: 'text', notes: 'text', image_id: 'file', photos: 'json', status: ['planning', 'booked', 'done'], honeymoon: 'bool', ...REMIND },
  },
  trip_items: {
    label: 'عنصر رحلة',
    required: ['trip_id', 'title'],
    parent: { col: 'trips', key: 'trip_id' },
    fields: { trip_id: 'str', section: ['place', 'restaurant', 'activity', 'checklist', 'itinerary', 'expense'], title: 'str', date: 'date', time: 'time', amount: 'num', url: 'url', notes: 'text', done: 'bool' },
  },
  honeymoon: {
    label: 'وجهة',
    required: ['name'],
    fields: { name: 'str', country: 'str', image_id: 'file', budget: 'num', flight_cost: 'num', hotel_cost: 'num', best_time: 'str', duration: 'int', pros: 'text', cons: 'text', rating: 'int', notes: 'text', chosen: 'bool', trip_id: 'str' },
  },
  honey_items: {
    label: 'عنصر شهر العسل',
    required: ['title'],
    fields: { section: ['flight', 'hotel', 'activity', 'restaurant', 'sight', 'itinerary', 'packing', 'shopping', 'booking', 'budget', 'photo', 'note'], title: 'str', destination_id: 'str', date: 'date', amount: 'num', url: 'url', notes: 'text', done: 'bool', image_id: 'file' },
  },
  shopping: {
    label: 'منتج',
    required: ['name'],
    fields: { name: 'str', qty: 'str', category: ['groceries', 'home', 'personal', 'gifts', 'other'], notes: 'text', buyer: 'user', done: 'bool', done_by: 'str', done_at: 'str', ...REMIND },
  },
  expenses: {
    label: 'مصروف',
    required: ['title', 'amount', 'date'],
    fields: { title: 'str', amount: 'num', date: 'date', category: ['food', 'restaurants', 'shopping', 'trips', 'gifts', 'entertainment', 'transportation', 'other'], paid_by: 'user', notes: 'text', receipt_id: 'file', trip_id: 'str' },
  },
  budgets: {
    label: 'ميزانية',
    required: ['month'],
    unique: ['month'],
    fields: { month: 'month', amount: 'num' },
  },
  notes: {
    label: 'رسالة',
    required: [],
    fields: { title: 'str', body: 'text', image_id: 'file', date: 'date', pinned: 'bool', kind: ['morning', 'surprise', 'reminder', 'idea', 'remember', 'suggestion', 'other'], color: ['cream', 'rose', 'sand', 'sage', 'charcoal'] },
  },
// ======================= v3 sections =======================
  wishes: {
    label: 'أمنية', group: 'wishes',
    required: ['title'],
    // pick_* / done_* are set only through actions (routes/actions.js)
    protected: ['picked_by', 'picked_at', 'history'],
    fields: { title: 'str', description: 'text', image_id: 'file', importance: ['low', 'medium', 'high'], category: ['experience', 'travel', 'gift', 'restaurant', 'activity', 'purchase', 'personal', 'shared', 'other'], status: ['open', 'planning', 'chosen', 'done'], notes: 'text', picked_by: 'str', picked_at: 'str', pick_date: 'date', pick_notes: 'text', surprise: 'bool', done_date: 'date', done_photo: 'file', memory_id: 'str', history: 'json' },
  },
  monthlies: {
    label: 'ذكرى شهرية', group: 'anniversary',
    required: ['date'],
    unique: ['date'],
    fields: { date: 'date', note: 'text', did: 'text', photos: 'json' },
  },
  outings: {
    label: 'خطة يوم', group: 'outings',
    required: ['title', 'date'],
    fields: { title: 'str', date: 'date', start_time: 'time', description: 'text', budget: 'num', notes: 'text', maps_url: 'url', photos: 'json', status: ['planned', 'done', 'cancelled'], memory_id: 'str', source_col: 'str', source_id: 'str' },
  },
  outing_items: {
    label: 'نشاط', group: 'outings',
    required: ['outing_id', 'title'],
    parent: { col: 'outings', key: 'outing_id' },
    fields: { outing_id: 'str', time: 'time', title: 'str', kind: ['activity', 'restaurant', 'cafe', 'place', 'event', 'dessert', 'other'], place: 'str', maps_url: 'url', cost: 'num', notes: 'text', done: 'bool' },
  },
  memories: {
    label: 'ذكرى', group: 'memories',
    required: ['title', 'date'],
    letterFields: { comment_e: 'E', comment_r: 'R' }, // each person writes only their own comment
    fields: { title: 'str', date: 'date', description: 'text', places: 'text', restaurants: 'text', activities: 'text', location: 'str', photos: 'json', rating: 'int', comment_e: 'text', comment_r: 'text', source_col: 'str', source_id: 'str' },
  },
  visited: {
    label: 'مكان زرناه', group: 'memories',
    required: ['name'],
    fields: { name: 'str', type: ['restaurant', 'cafe', 'hotel', 'city', 'event', 'tourist', 'fun', 'other'], location: 'str', maps_url: 'url', lat: 'geo', lng: 'geo', visit_date: 'date', photos: 'json', description: 'text', rating: 'int', notes: 'text', revisit: 'bool', place_id: 'str' },
  },
  appointments: {
    label: 'موعد', group: 'appointments',
    required: ['title', 'date'],
    fields: { title: 'str', kind: ['hospital', 'doctor', 'lab', 'dental', 'other'], person: 'user', date: 'date', time: 'time', location: 'str', maps_url: 'url', description: 'text', notes: 'text', remind: ['', '1', 'h1', 'h3', 'h6', 'custom'], remind_at: 'datetime', attachment_id: 'file', attachment_name: 'str', status: ['upcoming', 'done', 'cancelled'] },
  },
  daily_tasks: {
    label: 'مهمة يومية', group: 'daily',
    required: ['title', 'date'],
    fields: { title: 'str', description: 'text', assignee: 'user', date: 'date', time: 'time', priority: PRIORITY, status: ['pending', 'in_progress', 'done'], notes: 'text', completed_by: 'str', completed_at: 'str' },
  },
  cravings: {
    label: 'رغبة', group: 'cravings',
    required: ['text'],
    fields: { text: 'str', category: ['food', 'drink', 'dessert', 'outing', 'activity', 'order', 'other'], date: 'date', image_id: 'file', note: 'text', status: ['open', 'planned', 'done'], link_col: 'str', link_id: 'str' },
  },
  confessions: {
    label: 'اعتراف', group: 'confessions',
    required: ['body'],
    ownerWrite: true,
    protected: ['read_at'],
    fields: { title: 'str', body: 'text', importance: ['low', 'medium', 'high'], needs_talk: 'bool', note: 'text', read_at: 'str', status: ['open', 'discussed'] },
  },
  upsets: {
    label: 'موقف', group: 'upsets',
    required: ['title'],
    fields: { title: 'str', details: 'text', date: 'date', about: 'user', what_bothered: 'text', wished_instead: 'text', want_talk: 'bool', status: ['unread', 'read', 'needs_talk', 'discussed', 'resolved'] },
  },
  joys: {
    label: 'عنصر', group: 'joys',
    required: ['title', 'kind'],
    ownerWrite: true,
    fields: { kind: ['joy', 'dislike'], title: 'str', description: 'text', category: ['words', 'time', 'gifts', 'help', 'attention', 'surprise', 'behavior', 'preference', 'other'], importance: ['very', 'normal'], notes: 'text' },
  },
  urgent: {
    label: 'أمر عاجل', group: 'urgent',
    required: ['title'],
    fields: { title: 'str', details: 'text', assignee: 'user', deadline: 'date', priority: ['critical', 'urgent', 'normal'], status: ['open', 'done'], notes: 'text', link_col: 'str', link_id: 'str' },
  },
  requests: {
    label: 'طلب', group: 'requests',
    required: ['title', 'to_user'],
    protected: ['responded_at', 'history'],
    fields: { title: 'str', kind: ['help', 'outing', 'purchase', 'time', 'favor', 'gift', 'other'], details: 'text', to_user: 'user', proposed_date: 'date', status: ['pending', 'approved', 'rejected', 'clarify', 'postponed', 'done'], response_note: 'text', responded_at: 'str', notes: 'text', history: 'json', link_col: 'str', link_id: 'str' },
  },
  commitments: {
    label: 'تعهد', group: 'commitments',
    required: ['title', 'promiser'],
    protected: ['status', 'accepted_by', 'accepted_at', 'history'],
    fields: { title: 'str', details: 'text', promiser: 'user', start_date: 'date', duration_days: 'int', notes: 'text', status: ['pending', 'accepted', 'rejected', 'completed'], accepted_by: 'str', accepted_at: 'str', history: 'json' },
  },
  agreements: {
    label: 'اتفاق', group: 'agreements',
    required: ['title'],
    protected: ['e_approved_at', 'r_approved_at', 'closed', 'version', 'history'],
    resetOnChange: ['title', 'details', 'date', 'end_date'], // editing an approved agreement asks both again
    fields: { title: 'str', details: 'text', date: 'date', end_date: 'date', notes: 'text', draft: 'bool', e_approved_at: 'str', r_approved_at: 'str', closed: ['', 'completed', 'cancelled'], version: 'int', history: 'json', link_col: 'str', link_id: 'str' },
  },
  needs: {
    label: 'غرض', group: 'needs',
    required: ['name'],
    fields: { name: 'str', description: 'text', qty: 'str', priority: ['critical', 'needed', 'later'], image_id: 'file', notes: 'text', bought: 'bool', bought_by: 'str', bought_at: 'str', price: 'num', buy_date: 'date', shopping_id: 'str' },
  },
  reminders: {
    label: 'تذكير', group: 'reminders',
    required: ['title', 'target', 'date'],
    fields: { title: 'str', details: 'text', target: 'user', date: 'date', time: 'time', priority: ['low', 'medium', 'high'], repeat: ['none', 'daily', 'weekly', 'monthly'], status: ['pending', 'done'], fired_at: 'str', link_col: 'str', link_id: 'str' },
  }
};

export const COL_NAMES = Object.keys(COLLECTIONS);

const SQL_TYPE = { int: 'INTEGER', num: 'REAL', geo: 'REAL', bool: 'INTEGER' };
export function createTableSQL(name) {
  const def = COLLECTIONS[name];
  const cols = ['id TEXT PRIMARY KEY'];
  for (const [k, t] of Object.entries(def.fields)) cols.push(`${k} ${SQL_TYPE[t] || 'TEXT'}`);
  cols.push('created_by TEXT NOT NULL', 'updated_by TEXT', 'created_at TEXT NOT NULL', 'updated_at TEXT NOT NULL');
  let sql = `CREATE TABLE ${name} (\n  ${cols.join(',\n  ')}\n);`;
  if (def.unique) sql += `\nCREATE UNIQUE INDEX ux_${name} ON ${name} (${def.unique.join(', ')});`;
  if (def.parent) sql += `\nCREATE INDEX ix_${name}_parent ON ${name} (${def.parent.key});`;
  return sql;
}
