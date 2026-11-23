/**
 * Word lists used by the scorer. Kept separate so they're easy to review
 * and extend without touching logic.
 */

/** Verbs that signal ownership and impact at the start of a bullet. */
export const ACTION_VERBS = new Set(
  `
accelerated achieved acquired adapted administered advised advocated analyzed analysed architected
arranged assembled assessed audited authored automated awarded balanced boosted budgeted built
calculated captured centralized centralised chaired championed clarified coached collaborated
communicated compiled completed composed conceived conceptualized conducted configured consolidated
constructed consulted contributed converted coordinated created cultivated cut debugged decreased
defined delegated delivered demonstrated deployed designed detected determined developed devised
diagnosed directed discovered documented doubled drafted drove earned edited eliminated enabled
enforced engineered enhanced ensured established estimated evaluated examined exceeded executed
expanded expedited facilitated finalized financed forecasted formed formulated founded generated
guided halved handled headed hired identified illustrated implemented improved increased influenced
initiated innovated inspected installed instituted instructed integrated interpreted interviewed
introduced invented investigated launched led lectured leveraged lifted lowered maintained managed
mapped marketed mastered maximized measured mediated mentored merged migrated minimized modeled
modelled moderated modernized monitored motivated navigated negotiated operated optimized optimised
orchestrated organized organised originated outperformed overhauled oversaw owned partnered performed
persuaded piloted pioneered planned prepared presented prevented prioritized processed procured
produced programmed projected promoted proposed prototyped proved provided published purchased
quantified raised ran rebuilt recommended reconciled recruited redesigned reduced refactored refined
reinforced remodeled rendered reorganized repaired replaced reported researched resolved restored
restructured revamped reviewed revised revitalized saved scaled scheduled scoped secured selected
served shaped shipped simplified sold solved spearheaded specified sponsored standardized steered
streamlined strengthened structured studied submitted succeeded summarized supervised supported
surpassed surveyed sustained synthesized systematized tailored targeted taught tested tracked
trained transformed translated trimmed tripled troubleshot tutored unified united updated upgraded
utilized validated verified visualized volunteered won wrote
`
    .split(/\s+/)
    .filter(Boolean),
)

/** Weak openers that hide what you actually did. */
export const WEAK_OPENERS = new Set([
  'responsible',
  'responsibilities',
  'duties',
  'worked',
  'helped',
  'assisted',
  'involved',
  'participated',
  'tasked',
  'was',
  'were',
  'handled',
  'did',
  'various',
  'i',
  'my',
])

/** Overused filler phrases recruiters and some parsers flag. */
export const BUZZWORDS = [
  'team player',
  'hard worker',
  'hard-working',
  'go-getter',
  'self-starter',
  'think outside the box',
  'results-driven',
  'results driven',
  'detail-oriented',
  'detail oriented',
  'synergy',
  'synergies',
  'dynamic',
  'passionate',
  'motivated',
  'fast-paced',
  'fast paced',
  'proven track record',
  'excellent communication skills',
  'go above and beyond',
  'thought leader',
  'rockstar',
  'ninja',
  'guru',
]

/**
 * Small English dictionary of words that are commonly misspelled on resumes,
 * mapped to the correct form. We deliberately do not ship a full dictionary:
 * resumes are full of proper nouns and tech names, and false positives would
 * be worse than a short list of high-confidence hits.
 */
export const COMMON_MISSPELLINGS: Record<string, string> = {
  acheive: 'achieve',
  acheived: 'achieved',
  acheivement: 'achievement',
  acheivements: 'achievements',
  accomodate: 'accommodate',
  accross: 'across',
  acommodate: 'accommodate',
  adress: 'address',
  agressive: 'aggressive',
  analize: 'analyze',
  anual: 'annual',
  arguement: 'argument',
  assesment: 'assessment',
  begining: 'beginning',
  beleive: 'believe',
  buisness: 'business',
  bussiness: 'business',
  calender: 'calendar',
  catagory: 'category',
  cheif: 'chief',
  collegue: 'colleague',
  colaborate: 'collaborate',
  colaborated: 'collaborated',
  comittee: 'committee',
  commited: 'committed',
  comunication: 'communication',
  concious: 'conscious',
  consistant: 'consistent',
  definately: 'definitely',
  developement: 'development',
  developped: 'developed',
  diffrent: 'different',
  enviroment: 'environment',
  enviromental: 'environmental',
  experiance: 'experience',
  experince: 'experience',
  familar: 'familiar',
  finacial: 'financial',
  flexable: 'flexible',
  foriegn: 'foreign',
  goverment: 'government',
  grammer: 'grammar',
  guarentee: 'guarantee',
  harrass: 'harass',
  immediatly: 'immediately',
  implemeted: 'implemented',
  implimented: 'implemented',
  independant: 'independent',
  inovative: 'innovative',
  intrest: 'interest',
  judgement: 'judgment',
  knowlege: 'knowledge',
  liason: 'liaison',
  liasion: 'liaison',
  lisence: 'license',
  maintainance: 'maintenance',
  maintenence: 'maintenance',
  managment: 'management',
  managable: 'manageable',
  neccessary: 'necessary',
  necesary: 'necessary',
  occassion: 'occasion',
  occured: 'occurred',
  occurence: 'occurrence',
  oppurtunity: 'opportunity',
  opertunity: 'opportunity',
  paralel: 'parallel',
  perfomance: 'performance',
  performace: 'performance',
  personel: 'personnel',
  posession: 'possession',
  prefered: 'preferred',
  proffesional: 'professional',
  profesional: 'professional',
  programing: 'programming',
  recieve: 'receive',
  recieved: 'received',
  recomend: 'recommend',
  recomended: 'recommended',
  refered: 'referred',
  relevent: 'relevant',
  responsable: 'responsible',
  responsibilty: 'responsibility',
  responsiblities: 'responsibilities',
  seperate: 'separate',
  sucess: 'success',
  sucessful: 'successful',
  succesful: 'successful',
  succesfully: 'successfully',
  supercede: 'supersede',
  tecnology: 'technology',
  technolgy: 'technology',
  thier: 'their',
  truely: 'truly',
  untill: 'until',
  usefull: 'useful',
  wich: 'which',
  wierd: 'weird',
  writting: 'writing',
}

/** Section headings an ATS reliably recognises; used by the headings check. */
export const PREFERRED_HEADINGS: Record<string, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
}
