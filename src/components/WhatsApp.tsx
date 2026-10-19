import { useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker, { Theme, EmojiStyle } from "emoji-picker-react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft, Check, CheckCheck, ChevronDown, Copy, Image as ImageIcon, Mic, MoreVertical, Paperclip,
  Plus, Reply, Search, Send, Smile, Sticker, Trash2, Volume2, X, Lock, Wallpaper, FileText, Square, Bell, Phone, Video, Camera, User,
} from "lucide-react";
import { askAI, genImage } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import doodle from "@/assets/wa-doodle.jpg";
import qiLogo from "@/assets/qi-logo.png.asset.json";
import qiAvatar from "@/assets/qi-avatar.png.asset.json";

type Msg = {
  id: string; role: "user" | "assistant"; text?: string | undefined; sticker?: string | undefined; image?: string | undefined;
  audio?: string | undefined; transcript?: string | undefined; replyTo?: string | undefined; reactions?: string[] | undefined; time: number;
  suggestions?: string[] | undefined; loadingImage?: boolean | undefined;
};
type Chat = { id: string; title: string; messages: Msg[]; updated: number };

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const STICKERS = "😂🤣😍🥰😘😎🤩🥳😇🤔🤗🤭😴🤯😱😡🥺😭😅🙄😏😬🤡👻💀👽🤖😺🙈🙉🙊💯🔥✨🎉🎊💪👏🙌👌✌️🤞🫶❤️💔💚💙🌹🌙⭐☀️🕋🕌📿🤲☕🍕🍩🎂🐱🐶🦁🐼🐸🦄🐢🚀🏆⚽🎮📚💡⏰💰👑🌈".match(/\p{Extended_Pictographic}\uFE0F?/gu)!;
const WALLS = ["doodle", "bg-wall-1", "bg-wall-2", "bg-wall-3", "bg-wall-4", "bg-wa-chat"];

function load<T>(k: string, d: T): T {
  if (typeof window === "undefined") return d;
  try { return JSON.parse(localStorage.getItem(k) || "") as T; } catch { return d; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } }

function parseAI(raw: string) {
  let text = raw;
  let sticker: string | undefined; let image: string | undefined; let suggestions: string[] | undefined;
  text = text.replace(/\[\[STICKER:(.*?)\]\]/s, (_, s) => { sticker = s.trim(); return ""; });
  text = text.replace(/\[\[IMAGE:(.*?)\]\]/s, (_, s) => { image = s.trim(); return ""; });
  text = text.replace(/\[\[SUGGEST:(.*?)\]\]/s, (_, s) => { suggestions = s.split("|").map((x: string) => x.trim()).filter(Boolean); return ""; });
  return { text: text.trim(), sticker, image, suggestions };
}

function isDark() { return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches; }

export default function WhatsApp() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wall, setWall] = useState("doodle");
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [panel, setPanel] = useState<null | "emoji" | "sticker">(null);
  const [menu, setMenu] = useState(false);
  const [wallMenu, setWallMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [msgMenu, setMsgMenu] = useState<string | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [call, setCall] = useState<null | "voice" | "video">(null);
  const [profile, setProfile] = useState(false);
  const [userPanel, setUserPanel] = useState(false);
  const [userPic, setUserPic] = useState<string | null>(null);
  const [pending, setPending] = useState<{ image?: string; name: string; doc?: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const picRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ mr?: MediaRecorder; sr?: any; transcript: string; chunks: Blob[] }>({ transcript: "", chunks: [] });

  useEffect(() => {
    const c = load<Chat[]>("qi-chats", []);
    setChats(c); setActiveId(c[0]?.id ?? null); setWall(load("qi-wall", "doodle")); setUserPic(load<string | null>("qi-user-pic", null)); setReady(true);
  }, []);
  useEffect(() => { if (ready) save("qi-chats", chats); }, [chats, ready]);
  useEffect(() => { if (ready) save("qi-wall", wall); }, [wall, ready]);

  const chat = chats.find((c) => c.id === activeId) ?? null;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat?.messages.length, typing]);

  const updateChat = (id: string, fn: (c: Chat) => Chat) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  function newChat() {
    const c: Chat = { id: uid(), title: "QI New", messages: [], updated: Date.now() };
    setChats((cs) => [c, ...cs]); setActiveId(c.id); return c;
  }

  function notify(body: string) {
    if (typeof document !== "undefined" && document.hidden && "Notification" in window && Notification.permission === "granted")
      new Notification("QI New", { body: body.slice(0, 120) });
  }

  async function send(payload: Partial<Msg>, extraSystem?: string) {
    const c = chat ?? newChat();
    const m: Msg = { id: uid(), role: "user", time: Date.now(), replyTo: replyTo?.id, ...payload };
    const history = [...c.messages, m];
    updateChat(c.id, (x) => ({
      ...x, messages: history.map((h) => ({ ...h, suggestions: undefined })), updated: Date.now(),
      title: x.messages.length === 0 ? (m.text || m.transcript || m.sticker || "📷").slice(0, 40) : x.title,
    }));
    setInput(""); setReplyTo(null); setPanel(null); setTyping(true);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();

    const apiMsgs = history.map((h) => {
      const quoted = h.replyTo ? history.find((q) => q.id === h.replyTo) : undefined;
      const prefix = quoted ? `(Replying to ${quoted.role === "user" ? "my" : "your"} message: "${(quoted.text || quoted.transcript || quoted.sticker || "image").slice(0, 200)}")\n` : "";
      const body = prefix + (h.text || h.transcript || (h.sticker ? `[sent sticker ${h.sticker}]` : "") || (h.image && h.role === "assistant" ? "[image]" : ""));
      if (h.role === "user" && h.image) {
        return { role: "user" as const, content: [{ type: "text" as const, text: body || "Describe/explain this image." }, { type: "image_url" as const, image_url: { url: h.image } }] };
      }
      return { role: h.role, content: body || "…" };
    });

    try {
      const r = await askAI({ data: { messages: apiMsgs, extraSystem } });
      const p = parseAI(r.error ? `⚠️ ${r.error}` : r.text);
      const aid = uid();
      const a: Msg = { id: aid, role: "assistant", time: Date.now(), text: p.text || undefined, sticker: p.sticker, suggestions: p.suggestions, loadingImage: !!p.image };
      updateChat(c.id, (x) => ({ ...x, messages: [...x.messages, a], updated: Date.now() }));
      notify(p.text || p.sticker || "");
      if (p.image) {
        const img = await genImage({ data: { prompt: p.image } });
        updateChat(c.id, (x) => ({ ...x, messages: x.messages.map((mm) => mm.id === aid ? { ...mm, loadingImage: false, image: img.url || undefined, text: img.error ? `${mm.text ?? ""}\n\n⚠️ ${img.error}` : mm.text } : mm) }));
      }
    } catch (e) {
      updateChat(c.id, (x) => ({ ...x, messages: [...x.messages, { id: uid(), role: "assistant", time: Date.now(), text: "⚠️ " + (e as Error).message }] }));
    } finally { setTyping(false); }
  }

  function onFile(f: File) {
    if (f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = () => setPending({ image: r.result as string, name: f.name });
      r.readAsDataURL(f);
    } else f.text().then((t) => setPending({ name: f.name, doc: t.slice(0, 15000) }));
  }

  function submit() {
    const t = input.trim();
    if (pending?.image) send(t ? { image: pending.image, text: t } : { image: pending.image });
    else if (pending?.doc !== undefined) send({ text: `📄 ${pending.name}\n\n${pending.doc}${t ? "\n\n" + t : ""}` });
    else if (t) send({ text: t });
    else return;
    setPending(null);
  }

  function onUserPic(f: File) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const s = Math.min(img.width, img.height);
        c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
        const url = c.toDataURL("image/jpeg", 0.85);
        setUserPic(url); save("qi-user-pic", url);
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recRef.current = { mr, transcript: "", chunks: [] };
      mr.ondataavailable = (e) => recRef.current.chunks.push(e.data);
      mr.start();
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const sr = new SR(); sr.continuous = true; sr.interimResults = false; sr.lang = navigator.language;
        sr.onresult = (e: any) => { recRef.current.transcript = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); };
        sr.start(); recRef.current.sr = sr;
      }
      setRecording(true);
    } catch { alert("Microphone permission is required"); }
  }
  function stopRec(cancel = false) {
    const { mr, sr } = recRef.current;
    setRecording(false);
    sr?.stop();
    if (!mr) return;
    mr.onstop = () => {
      mr.stream.getTracks().forEach((t) => t.stop());
      if (cancel) return;
      setTimeout(() => {
        const blob = new Blob(recRef.current.chunks, { type: "audio/webm" });
        const fr = new FileReader();
        fr.onload = () => send({ audio: fr.result as string, transcript: recRef.current.transcript || "(voice message)" });
        fr.readAsDataURL(blob);
      }, 400);
    };
    mr.stop();
  }

  function speak(t: string) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/[*#_`]/g, ""));
    if (/[\u0600-\u06FF]/.test(t)) u.lang = "ar-SA";
    speechSynthesis.speak(u);
  }

  function react(mid: string, e: string) {
    if (!chat) return;
    updateChat(chat.id, (x) => ({ ...x, messages: x.messages.map((m) => m.id === mid ? { ...m, reactions: m.reactions?.includes(e) ? m.reactions.filter((r) => r !== e) : [e] } : m) }));
    setReactFor(null); setMsgMenu(null);
  }

  function jumpTo(id: string) {
    document.getElementById("m-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id); setTimeout(() => setFlash(null), 2500);
  }

  const filtered = useMemo(() => chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()) || c.messages.some((m) => m.text?.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.updated - a.updated), [chats, search]);
  const lastSuggestions = chat?.messages.at(-1)?.role === "assistant" ? chat.messages.at(-1)?.suggestions : undefined;
  const rtl = (s?: string) => (s && /[\u0590-\u08FF]/.test(s) ? "rtl" : "ltr");

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground" onClick={() => { setMsgMenu(null); setMenu(false); setWallMenu(false); setReactFor(null); }}>
      {/* Sidebar */}
<aside className={`${chat ? "hidden md:flex" : "flex"} relative w-full md:w-[380px] shrink-0 flex-col border-r bg-wa-panel`}>
        <header className="flex h-[60px] items-center justify-between bg-wa-header px-4">
          <div className="flex items-center gap-2">
            <img src={qiLogo.url} alt="QI New" className="h-9 w-9 rounded-full object-cover" />
            <span className="text-lg font-semibold text-wa-green">QI New</span>
          </div>
          <div className="flex items-center gap-1 text-wa-icon">
            <IconBtn title="Notifications" onClick={() => "Notification" in window && Notification.requestPermission()}><Bell size={20} /></IconBtn>
            <button title="My profile" onClick={(e) => { e.stopPropagation(); setUserPanel(true); }}><UserPic src={userPic} /></button>
          </div>
        </header>
        <div className="p-2">
          <div className="flex items-center gap-3 rounded-lg bg-wa-header px-3 py-1.5">
            <Search size={16} className="text-wa-icon" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search or start new chat" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
        </div>
        <div className="wa-scroll flex-1 overflow-y-auto">
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No chats yet — tap + to start</p>}
          {filtered.map((c) => {
            const last = c.messages.at(-1);
            return (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`group flex w-full items-center gap-3 px-3 text-left hover:bg-wa-hover ${c.id === activeId ? "bg-wa-hover" : ""}`}>
                <Avatar />
                <div className="min-w-0 flex-1 border-b py-3">
                  <div className="flex justify-between"><span className="truncate font-medium" dir="auto">{c.title}</span><span className="text-xs text-muted-foreground">{last && fmt(last.time)}</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-muted-foreground" dir="auto">{last ? (last.role === "user" ? "✓✓ " : "") + (last.text || last.transcript || last.sticker || "📷 Photo") : "Encrypted chat"}</p>
                    <Trash2 size={14} className="hidden shrink-0 text-wa-icon group-hover:block" onClick={(e) => { e.stopPropagation(); setChats((cs) => cs.filter((x) => x.id !== c.id)); if (activeId === c.id) setActiveId(null); }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={newChat}
          title="محادثة جديدة"
          aria-label="محادثة جديدة"
          className="absolute bottom-5 left-5 z-20 h-14 w-14 rounded-full bg-wa-new-chat text-primary-foreground shadow-md hover:bg-wa-new-chat hover:brightness-105 active:scale-95 [&_svg]:size-6"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M4 5h12v4h4v10H7l-3 3V5Z" />
            <path className="text-wa-new-chat" stroke="currentColor" strokeWidth="1.5" d="M7 10h6M7 13h10M7 16h7" />
            <path stroke="currentColor" strokeWidth="2" d="M19 2v6m-3-3h6" />
          </svg>
        </Button>
      </aside>

      {userPanel && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-wa-panel md:right-auto md:w-[380px]" onClick={(e) => e.stopPropagation()}>
          <header className="flex h-[60px] items-center gap-4 bg-wa-header px-3">
            <IconBtn onClick={() => setUserPanel(false)}><ArrowLeft size={22} /></IconBtn>
            <span className="font-medium">My profile</span>
          </header>
          <div className="flex flex-col items-center gap-3 border-b py-6">
            <button title="Change photo" onClick={() => picRef.current?.click()} className="relative">
              <UserPic src={userPic} big />
              <span className="absolute bottom-1 right-1 rounded-full bg-wa-green p-2 text-primary-foreground"><Camera size={18} /></span>
            </button>
            <input ref={picRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUserPic(f); e.target.value = ""; }} />
            <div className="flex gap-2">
              <button onClick={() => picRef.current?.click()} className="rounded-full bg-wa-green px-4 py-1.5 text-sm text-primary-foreground">{userPic ? "Change photo" : "Upload photo"}</button>
              {userPic && <button onClick={() => { setUserPic(null); save("qi-user-pic", null); }} className="rounded-full border px-4 py-1.5 text-sm">Remove</button>}
            </div>
          </div>
          <div className="border-b px-4 py-3 text-sm">
            <div className="flex justify-between py-1"><span className="text-muted-foreground">Conversations</span><span>{chats.length}</span></div>
            <div className="flex justify-between py-1"><span className="text-muted-foreground">Messages sent</span><span>{chats.reduce((n, c) => n + c.messages.filter((m) => m.role === "user").length, 0)}</span></div>
            <div className="flex justify-between py-1"><span className="text-muted-foreground">Photos shared</span><span>{chats.reduce((n, c) => n + c.messages.filter((m) => m.image).length, 0)}</span></div>
          </div>
          <p className="px-4 py-3 text-xs text-muted-foreground"><Lock size={11} className="mr-1 inline" /> Your photo is saved only in this browser on this device.</p>
        </div>
      )}

      {/* Chat */}
      {!chat ? (
        <section className="hidden flex-1 flex-col items-center justify-center gap-4 border-b-[6px] border-wa-green bg-wa-header md:flex">
          <Avatar big />
          <h1 className="text-3xl font-light">QI New</h1>
          <p className="max-w-md text-center text-sm text-muted-foreground">Ask any question — sharia & fiqh with the four schools, or anything else. Free, in your language.</p>
          <button onClick={newChat} className="rounded-full bg-wa-green px-5 py-2 text-sm font-medium text-primary-foreground">Start chatting</button>
          <p className="mt-10 flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} /> Your chats are stored privately on this device</p>
        </section>
      ) : (
        <section className="relative flex flex-1 flex-col">
          <header className="z-10 flex h-[60px] items-center gap-3 bg-wa-header px-3">
            <IconBtn className="md:hidden" onClick={() => setActiveId(null)}><ArrowLeft size={22} /></IconBtn>
            <button onClick={(e) => { e.stopPropagation(); setProfile(true); }} className="flex flex-1 items-center gap-3 text-left">
              <Avatar />
              <div className="flex-1 leading-tight">
                <div className="font-medium">QI New</div>
                <div className="text-xs text-muted-foreground">{typing ? <span className="text-wa-green">typing…</span> : "online"}</div>
              </div>
            </button>
            <div className="relative flex gap-1 text-wa-icon">
              <IconBtn title="Video call" onClick={() => setCall("video")}><Video size={20} /></IconBtn>
              <IconBtn title="Voice call" onClick={() => setCall("voice")}><Phone size={19} /></IconBtn>
              <IconBtn onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}><MoreVertical size={20} /></IconBtn>
              {wallMenu && (
                <div className="absolute right-0 top-11 z-30 grid grid-cols-3 gap-2 rounded-lg bg-popover p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  {WALLS.map((w) => (
                    <button key={w} onClick={() => setWall(w)} className={`h-14 w-14 rounded-md border-2 ${wall === w ? "border-wa-green" : "border-transparent"} ${w === "doodle" ? "wa-doodle" : w}`} style={w === "doodle" ? { backgroundImage: `url(${doodle})`, backgroundSize: "60px" } : undefined} />
                  ))}
                </div>
              )}
              {menu && (
                <div className="absolute right-0 top-11 z-30 w-56 rounded-md bg-popover py-2 text-sm text-popover-foreground shadow-xl">
                  <MenuItem onClick={() => setProfile(true)}><Search size={16} /> Contact info & media</MenuItem>
                  <MenuItem onClick={() => send({ text: "📝 Summarize our conversation" }, "The user wants a very simple, easy summary of the whole conversation as short bullet points, in their language.")}><FileText size={16} /> Summarize chat</MenuItem>
                  <MenuItem onClick={() => send({ text: "🎨 Make an illustrative image explaining the main topic of our chat" })}><ImageIcon size={16} /> Illustrate topic</MenuItem>
                  <MenuItem onClick={(e) => { e?.stopPropagation(); setMenu(false); setWallMenu(true); }}><Wallpaper size={16} /> Wallpaper</MenuItem>
                  <MenuItem onClick={() => { if (confirm("Clear this chat?")) updateChat(chat.id, (x) => ({ ...x, messages: [] })); }}><Trash2 size={16} /> Clear chat</MenuItem>
                </div>
              )}
            </div>
          </header>

          <div className={`relative flex-1 overflow-hidden ${wall === "doodle" ? "bg-wa-chat" : wall}`}>
            {wall === "doodle" && <div className="wa-doodle-img pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${doodle})`, backgroundSize: "420px" }} />}
            <div className="wa-scroll relative h-full overflow-y-auto px-[6%] py-4">
              <div className="mx-auto mb-3 w-fit max-w-md rounded-lg bg-wa-in px-3 py-1.5 text-center text-xs text-muted-foreground shadow-sm">
                <Lock size={11} className="mr-1 inline" /> Messages are private and stored only on your device. Tap to learn more.
              </div>
              {chat.messages.map((m, i) => {
                const out = m.role === "user";
                const first = i === 0 || chat.messages[i - 1]!.role !== m.role;
                const quoted = m.replyTo ? chat.messages.find((q) => q.id === m.replyTo) : undefined;
                const bare = (m.sticker && !m.text && !m.image) ;
                return (
                  <div key={m.id} id={"m-" + m.id} className={`flex items-start gap-2 ${out ? "flex-row-reverse" : ""} ${first ? "mt-3" : "mt-0.5"} ${flash === m.id ? "wa-flash rounded" : ""}`}>
                    <div className="w-8 shrink-0">
                      {first && (out
                        ? <button onClick={(e) => { e.stopPropagation(); setUserPanel(true); }}><UserPic src={userPic} /></button>
                        : <button onClick={(e) => { e.stopPropagation(); setProfile(true); }}><img src={qiAvatar.url} alt="QI New" className="h-8 w-8 rounded-full object-cover" /></button>)}
                    </div>
                    <div className="group relative max-w-[80%] md:max-w-[65%]" onDoubleClick={() => setReplyTo(m)}>
                      {bare ? (
                        <div className={`wa-pop text-[96px] leading-none ${out ? "text-right" : ""}`}>{m.sticker}
                          <div className="text-right text-[11px] text-muted-foreground">{fmt(m.time)}</div></div>
                      ) : (
                        <div className={`relative rounded-lg px-2 pb-1.5 pt-1.5 text-[14.2px] shadow-sm ${out ? "bg-wa-out" : "bg-wa-in"} ${first ? (out ? "tail-out rounded-tr-none" : "tail-in rounded-tl-none") : ""}`}>
                          {quoted && (
                            <button onClick={() => jumpTo(quoted.id)} className="mb-1 block w-full rounded-md border-l-4 border-wa-quote bg-foreground/5 px-2 py-1 text-left">
                              <div className="text-xs font-medium text-wa-quote">{quoted.role === "user" ? "You" : "QI New"}</div>
                              <div className="line-clamp-2 text-xs text-muted-foreground" dir="auto">{quoted.text || quoted.transcript || quoted.sticker || "📷 Photo"}</div>
                            </button>
                          )}
                          {m.sticker && <div className="wa-pop text-6xl">{m.sticker}</div>}
                          {m.image && <img src={m.image} alt="" className="mb-1 max-h-80 cursor-pointer rounded-md" onClick={() => window.open(m.image)} />}
                          {m.loadingImage && <div className="mb-1 flex h-48 w-64 items-center justify-center rounded-md bg-foreground/5 text-xs text-muted-foreground"><span className="animate-pulse">🎨 Generating image…</span></div>}
                          {m.audio && (
                            <div className="min-w-[240px]">
                              <audio src={m.audio} controls className="h-10 w-full" />
                              <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Transcript</summary><p dir="auto" className="mt-1 text-foreground">{m.transcript}</p></details>
                            </div>
                          )}
                          {m.text && (
                            <div dir={rtl(m.text)} className={`prose-sm max-w-none whitespace-pre-wrap break-words ${rtl(m.text) === "rtl" ? "pl-16" : "pr-16"} [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5`}>
                              {out ? m.text : <ReactMarkdown>{m.text}</ReactMarkdown>}
                            </div>
                          )}
                          <div className="float-right -mb-1 ml-2 mt-[-12px] flex items-center gap-1 text-[11px] text-muted-foreground">
                            {fmt(m.time)}{out && <CheckCheck size={16} className="text-wa-tick" />}
                          </div>
                          <div className="clear-both" />
                          {/* hover arrow */}
                          <button onClick={(e) => { e.stopPropagation(); setMsgMenu(msgMenu === m.id ? null : m.id); }} className={`absolute right-1 top-1 hidden rounded-full p-0.5 text-wa-icon group-hover:block ${out ? "bg-wa-out" : "bg-wa-in"}`}><ChevronDown size={18} /></button>
                        </div>
                      )}
                      {/* side reply/react buttons */}
                      <div className={`absolute top-1/2 hidden -translate-y-1/2 gap-1 group-hover:flex ${out ? "-left-20" : "-right-20"}`}>
                        <button onClick={(e) => { e.stopPropagation(); setReactFor(m.id); }} className="rounded-full bg-wa-header p-1.5 text-wa-icon shadow"><Smile size={16} /></button>
                        <button onClick={() => setReplyTo(m)} className="rounded-full bg-wa-header p-1.5 text-wa-icon shadow"><Reply size={16} /></button>
                      </div>
                      {m.reactions && m.reactions.length > 0 && (
                        <div className={`absolute -bottom-3 ${out ? "right-3" : "left-3"} rounded-full border bg-wa-in px-1.5 text-sm shadow`}>{m.reactions.join("")}</div>
                      )}
                      {reactFor === m.id && (
                        <div className={`absolute -top-12 z-20 flex gap-1 rounded-full bg-popover px-2 py-1 shadow-xl ${out ? "right-0" : "left-0"}`} onClick={(e) => e.stopPropagation()}>
                          {QUICK.map((q) => <button key={q} onClick={() => react(m.id, q)} className="text-2xl transition hover:scale-125">{q}</button>)}
                          <button onClick={() => setReactFor("pick-" + m.id)} className="rounded-full bg-muted px-2 text-wa-icon"><Plus size={16} /></button>
                        </div>
                      )}
                      {reactFor === "pick-" + m.id && (
                        <div className={`absolute bottom-full z-30 ${out ? "right-0" : "left-0"}`} onClick={(e) => e.stopPropagation()}>
                          <EmojiPicker theme={isDark() ? Theme.DARK : Theme.LIGHT} emojiStyle={EmojiStyle.NATIVE} onEmojiClick={(e) => react(m.id, e.emoji)} height={380} width={320} />
                        </div>
                      )}
                      {msgMenu === m.id && (
                        <div className={`absolute top-8 z-20 w-44 rounded-md bg-popover py-2 text-sm text-popover-foreground shadow-xl ${out ? "right-0" : "left-0"}`} onClick={(e) => e.stopPropagation()}>
                          <MenuItem onClick={() => { setReplyTo(m); setMsgMenu(null); }}><Reply size={15} /> Reply</MenuItem>
                          <MenuItem onClick={() => setReactFor(m.id)}><Smile size={15} /> React</MenuItem>
                          <MenuItem onClick={() => { navigator.clipboard.writeText(m.text || m.transcript || ""); setMsgMenu(null); }}><Copy size={15} /> Copy</MenuItem>
                          {(m.text || m.transcript) && <MenuItem onClick={() => { speak(m.text || m.transcript || ""); setMsgMenu(null); }}><Volume2 size={15} /> Read aloud</MenuItem>}
                          <MenuItem onClick={() => { updateChat(chat.id, (x) => ({ ...x, messages: x.messages.filter((mm) => mm.id !== m.id) })); }}><Trash2 size={15} /> Delete</MenuItem>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {typing && (
                <div className="mt-3 flex justify-start">
                  <div className="tail-in relative flex items-center gap-1 rounded-lg rounded-tl-none bg-wa-in px-4 py-3 shadow-sm">
                    {[0, 1, 2].map((d) => <span key={d} className="wa-dot h-2 w-2 rounded-full bg-wa-icon" style={{ animationDelay: `${d * 0.2}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={endRef} className="h-4" />
            </div>
          </div>

          {/* suggestions */}
          {lastSuggestions && !typing && (
            <div className="flex gap-2 overflow-x-auto bg-wa-header px-3 pt-2">
              {lastSuggestions.map((s) => <button key={s} dir="auto" onClick={() => send({ text: s })} className="shrink-0 rounded-full border border-wa-green px-3 py-1 text-sm text-wa-green hover:bg-wa-green/10">{s}</button>)}
            </div>
          )}

          {/* emoji + sticker panel */}
          {panel && (
            <div className="bg-wa-header">
              <div className="flex gap-1 border-b px-3 pt-2">
                <button onClick={() => setPanel("emoji")} className={`rounded-t-md px-4 py-1.5 text-sm ${panel === "emoji" ? "border-b-2 border-wa-green text-wa-green" : "text-muted-foreground"}`}><Smile size={16} className="mr-1 inline" />Emoji</button>
                <button onClick={() => setPanel("sticker")} className={`rounded-t-md px-4 py-1.5 text-sm ${panel === "sticker" ? "border-b-2 border-wa-green text-wa-green" : "text-muted-foreground"}`}><Sticker size={16} className="mr-1 inline" />Stickers</button>
              </div>
              {panel === "emoji" ? (
                <div className="[&_.EmojiPickerReact]:!w-full">
                  <EmojiPicker theme={isDark() ? Theme.DARK : Theme.LIGHT} emojiStyle={EmojiStyle.NATIVE} onEmojiClick={(e) => setInput((v) => v + e.emoji)} width="100%" height={300} previewConfig={{ showPreview: false }} />
                </div>
              ) : (
                <div className="wa-scroll grid h-[280px] grid-cols-6 gap-2 overflow-y-auto p-3 md:grid-cols-10">
                  {STICKERS.map((s, i) => <button key={i} onClick={() => send({ sticker: s })} className="text-5xl transition hover:scale-110">{s}</button>)}
                </div>
              )}
            </div>
          )}

          {replyTo && (
            <div className="flex items-center gap-2 bg-wa-header px-4 pt-2">
              <div className="flex-1 rounded-md border-l-4 border-wa-quote bg-foreground/5 px-3 py-1.5">
                <div className="text-xs font-medium text-wa-quote">{replyTo.role === "user" ? "You" : "QI New"}</div>
                <div className="line-clamp-1 text-sm text-muted-foreground" dir="auto">{replyTo.text || replyTo.transcript || replyTo.sticker || "📷 Photo"}</div>
              </div>
              <IconBtn onClick={() => setReplyTo(null)}><X size={20} /></IconBtn>
            </div>
          )}

          {pending && (
            <div className="flex items-center gap-3 bg-wa-header px-4 pt-2">
              {pending.image ? <img src={pending.image} alt="" className="h-16 w-16 rounded-md object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-md bg-foreground/5"><FileText size={28} className="text-wa-icon" /></div>}
              <span className="flex-1 truncate text-sm text-muted-foreground">{pending.name}</span>
              <IconBtn title="Remove" onClick={() => setPending(null)}><X size={20} /></IconBtn>
            </div>
          )}

          <footer className="flex items-end gap-2 bg-wa-header px-3 py-2">
            {recording ? (
              <div className="flex flex-1 items-center gap-3 rounded-lg bg-input px-4 py-2.5">
                <IconBtn onClick={() => stopRec(true)}><Trash2 size={20} className="text-destructive" /></IconBtn>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                <span className="flex-1 text-sm text-muted-foreground">Recording… speak now</span>
              </div>
            ) : (
              <div className="flex flex-1 items-end rounded-3xl bg-input px-1">
                <IconBtn title="Emoji & stickers" onClick={() => setPanel(panel ? null : "emoji")} className={panel ? "text-wa-green" : ""}><Smile size={22} /></IconBtn>
                <textarea
                  rows={1} value={input} dir="auto"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  placeholder="Type a message"
                  className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
                />
                <IconBtn title="Attach file" onClick={() => fileRef.current?.click()}><Paperclip size={20} /></IconBtn>
                <IconBtn title="Camera" onClick={() => camRef.current?.click()}><Camera size={20} /></IconBtn>
                <input ref={fileRef} type="file" accept="image/*,.txt,.md,.csv,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
                <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
              </div>
            )}
            {(input.trim() || pending) && !recording ? (
              <button onClick={submit} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-green text-primary-foreground"><Send size={20} /></button>
            ) : (
              <button onClick={() => (recording ? stopRec() : startRec())} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-green text-primary-foreground">
                {recording ? <Send size={20} /> : <Mic size={22} />}
              </button>
            )}
          </footer>
          {/* profile panel */}
          {profile && (
            <div className="absolute inset-0 z-40 flex flex-col overflow-y-auto bg-wa-panel" onClick={(e) => e.stopPropagation()}>
              <header className="flex h-[60px] items-center gap-4 bg-wa-header px-3">
                <IconBtn onClick={() => setProfile(false)}><X size={22} /></IconBtn>
                <span className="font-medium">Contact info</span>
              </header>
              <div className="flex flex-col items-center gap-2 border-b py-6">
                <Avatar big />
                <h2 className="text-xl font-medium">QI New</h2>
                <p className="text-sm text-muted-foreground">Free AI assistant — fiqh & everything</p>
              </div>
              <div className="border-b px-4 py-3">
                <h3 className="mb-2 text-sm text-wa-green">Media, links and docs</h3>
                {chat.messages.some((m) => m.image) ? (
                  <div className="grid grid-cols-3 gap-1">
                    {chat.messages.filter((m) => m.image).map((m) => (
                      <img key={m.id} src={m.image} alt="" className="aspect-square cursor-pointer rounded object-cover" onClick={() => { setProfile(false); jumpTo(m.id); }} />
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No media yet</p>}
              </div>
              <div className="border-b px-4 py-3">
                <h3 className="mb-2 text-sm text-wa-green">Conversations</h3>
                {chats.map((c) => (
                  <button key={c.id} onClick={() => { setActiveId(c.id); setProfile(false); }} className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-wa-hover ${c.id === activeId ? "bg-wa-hover" : ""}`}>
                    <Avatar />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" dir="auto">{c.title}</div>
                      <div className="text-xs text-muted-foreground">{c.messages.length} messages · {fmt(c.updated)}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 text-xs text-muted-foreground">
                <Lock size={11} className="mr-1 inline" /> Chats are stored only on this device.
              </div>
            </div>
          )}

          {/* call overlay */}
          {call && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-wa-panel" onClick={(e) => e.stopPropagation()}>
              <Avatar big />
              <div className="text-center">
                <h2 className="text-2xl font-medium">QI New</h2>
                <p className="mt-1 animate-pulse text-sm text-muted-foreground">{call === "video" ? "Video" : "Voice"} calling…</p>
              </div>
              <p className="max-w-xs text-center text-xs text-muted-foreground">Live calls aren't available — QI answers by chat only.</p>
              <button onClick={() => setCall(null)} className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-xl">
                <Phone size={24} className="rotate-[135deg]" />
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Avatar({ big }: { big?: boolean }) {
  return (
    <img
      src={qiAvatar.url}
      alt="QI New"
      className={`shrink-0 rounded-full object-cover ${big ? "h-28 w-28" : "h-10 w-10"}`}
    />
  );
}
function IconBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`rounded-full p-2 text-wa-icon transition hover:bg-foreground/10 ${className}`}>{children}</button>;
}
function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: (e?: React.MouseEvent) => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-wa-hover">{children}</button>;
}
function UserPic({ src, big }: { src: string | null; big?: boolean }) {
  const size = big ? "h-36 w-36" : "h-8 w-8";
  return src
    ? <img src={src} alt="Me" className={`${size} shrink-0 rounded-full object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted text-wa-icon`}><User size={big ? 64 : 18} /></span>;
}
// unused import guards
void Check; void Square;
