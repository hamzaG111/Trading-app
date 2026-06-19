import { BookOpen, Brain, Landmark, ScrollText, ShieldCheck, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui";

const FUNDS = [
  {
    name: "Renaissance — Medallion",
    who: "جيم سيمونز",
    lesson:
      "أعظم سجلّ في التاريخ (~39% صافي سنوياً لعقود). الدرس: حافة إحصائية صغيرة + آلاف الصفقات + رافعة منضبطة + سرّية تامة. العلم لا الحدس.",
  },
  {
    name: "Bridgewater — All Weather",
    who: "راي داليو",
    lesson:
      "تكافؤ المخاطر والتنويع الحقيقي: امتلك أصولاً تتصرّف بشكل مختلف في كل بيئة اقتصادية. «التنويع هو الغداء المجاني الوحيد».",
  },
  {
    name: "AQR",
    who: "كليف أسنس",
    lesson:
      "أكدمة العوامل (Factors): القيمة، الزخم، الجودة، الحجم. عوائد منهجية قابلة للتفسير والتكرار، لا سحر.",
  },
  {
    name: "Man AHL · Winton",
    who: "متابعو الاتجاه",
    lesson:
      "تتبّع الاتجاه عبر المستقبليات: اربح قليلاً مرات كثيرة واقطع الخسائر بسرعة. يحمي المحفظة في الأزمات (Crisis Alpha).",
  },
  {
    name: "Citadel · Millennium",
    who: "غريفين · إنغلاندر",
    lesson:
      "نموذج المنصّة متعدّد الاستراتيجيات: عشرات الفِرق غير المترابطة تحت سقف صارم لإدارة المخاطر. نتيجة: منحنى ناعم وثابت.",
  },
  {
    name: "Soros · Druckenmiller",
    who: "الماكرو العالمي",
    lesson:
      "«المهم ليس كم تربح أو تخسر، بل كم تجني حين تكون محقّاً وكم تخسر حين تكون مخطئاً». حجِّم بقوة عند القناعة، واحمِ رأس المال دائماً.",
  },
];

const SCIENCES = [
  { t: "الاحتمالات والإحصاء", d: "التوزيعات، القيمة المتوقّعة، الانحراف المعياري، فترات الثقة — لغة عدم اليقين." },
  { t: "السلاسل الزمنية", d: "الارتباط الذاتي، الثبات (Stationarity)، GARCH لتجمّع التذبذب، الزخم والارتداد." },
  { t: "تحسين المحافظ", d: "ماركويتز، الحدّ الكفء، تكافؤ المخاطر، ميزانية المخاطر بدل ميزانية رأس المال." },
  { t: "إدارة المخاطر", d: "VaR و CVaR، حجم المركز، معيار كيلي الجزئي، حدود السحب، اختبار الضغط." },
  { t: "تعلّم الآلة", d: "الانحدار، الأشجار، التحقّق المتقاطع — مع حذر شديد من فرط الملاءمة (Overfitting)." },
  { t: "بنية السوق", d: "السيولة، الفرق السعري، الانزلاق، تأثير التنفيذ على العوائد الحقيقية." },
];

const BOOKS = [
  "Quantitative Trading & Algorithmic Trading — Ernest Chan",
  "Advances in Financial Machine Learning — Marcos López de Prado",
  "Active Portfolio Management — Grinold & Kahn",
  "Trading Systems and Methods — Perry Kaufman",
  "Inside the Black Box — Rishi Narang",
  "Principles — Ray Dalio",
  "Fortune's Formula (معيار كيلي) — William Poundstone",
  "The Man Who Solved the Market (سيمونز) — Gregory Zuckerman",
  "Market Wizards — Jack Schwager",
  "Option Volatility & Pricing — Sheldon Natenberg",
];

const IRON_RULES = [
  "لا تُخاطر أبداً بأكثر من نسبة صغيرة (1–2%) من رأس المال في فكرة واحدة.",
  "احمِ رأس المال أولاً؛ العائد يأتي ثانياً. البقاء شرط النموّ.",
  "نوّع بين استراتيجيات غير مترابطة، لا بين أصول مترابطة فقط.",
  "اقطع الخسائر بسرعة، ودع الأرباح تركض مع الاتجاه.",
  "حجّم المركز حسب التذبذب: تذبذب أعلى ← مركز أصغر.",
  "احذر الرافعة: تُضاعف الأرباح والكوارث معاً.",
  "اختبر كل فكرة تاريخياً وخارج العيّنة قبل المخاطرة بمال حقيقي.",
  "تجنّب فرط الملاءمة: البساطة المتينة تتفوّق على التعقيد الهشّ.",
  "اكتب قواعدك ونفّذها آلياً؛ العاطفة عدوّ العائد.",
];

const PROP_PLAYBOOK = [
  "اقرأ عقد البرنامج كلمةً كلمة: حدّ يومي، حدّ كلي، هل السحب ثابت أم متحرّك، أيام دنيا، قواعد الاتساق.",
  "صغّر المخاطر اليومية لتبقى دائماً بعيداً عن الحدّ — استهدف نصف الحدّ المسموح كحاجز أمان.",
  "لا تطارد هدف الربح بصفقات كبيرة؛ الثبات البطيء يجتاز، والجشع يُفشِل.",
  "بعد التمويل، عاملْ رأس المال كأنه لك: نفس الانضباط، لأن خرق قاعدة = نهاية الحساب.",
  "وزّع المخاطرة عبر الوقت والأسواق؛ لا تضع كل البيض في يوم واحد.",
];

export default function Learn() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">المعرفة — علم صناعة الثروة</h1>
        <p className="page-sub">
          خلاصة مكثّفة من أعظم الكتب والصناديق في التداول الكمّي. هذه هي «العلوم» التي يقوم عليها
          النظام — اقرأها، فهي تساوي أكثر من أيّ زرّ سحري.
        </p>
      </div>

      <Card title="دروس من أعظم الصناديق" icon={<Landmark size={15} />} style={{ marginBottom: 18 }}>
        <div className="grid cols-3">
          {FUNDS.map((f) => (
            <div key={f.name} className="card" style={{ padding: 16 }}>
              <div className="tag" style={{ marginBottom: 8 }}>
                <TrendingUp size={12} /> {f.who}
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 15.5 }}>{f.name}</h3>
              <p className="learn-p" style={{ margin: 0, fontSize: 13 }}>
                {f.lesson}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid cols-2" style={{ gap: 18, marginBottom: 18 }}>
        <Card title="العلوم الأساسية" icon={<Brain size={15} />}>
          <ul className="list-clean">
            {SCIENCES.map((s) => (
              <li key={s.t} style={{ display: "block" }}>
                <div className="learn-h" style={{ fontSize: 14.5 }}>
                  {s.t}
                </div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {s.d}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="القوانين الحديدية للمخاطر" icon={<ShieldCheck size={15} />}>
          <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2.1, fontSize: 14 }}>
            {IRON_RULES.map((r) => (
              <li key={r} style={{ color: "var(--text)" }}>
                {r}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid cols-2" style={{ gap: 18 }}>
        <Card title="مكتبة لا غنى عنها" icon={<BookOpen size={15} />}>
          <ul className="list-clean">
            {BOOKS.map((b) => (
              <li key={b}>
                <span style={{ fontSize: 13.5 }}>{b}</span>
                <BookOpen size={14} className="muted" />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="دليل اجتياز شركات التمويل" icon={<ScrollText size={15} />}>
          <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2.1, fontSize: 14 }}>
            {PROP_PLAYBOOK.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
