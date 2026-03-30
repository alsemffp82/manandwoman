import { useState, useEffect, useRef, useCallback } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// API 유틸리티
// ══════════════════════════════════════════════════════════════════════════════
const api = {
  async request(path, options = {}) {
    const token = localStorage.getItem("geulter_token");
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");
    return data;
  },
  get: (path) => api.request(path),
  post: (path, body) => api.request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => api.request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => api.request(path, { method: "DELETE" }),
};

const AVATARS = ["🌸", "✈️", "📚", "🎨", "🎵", "🌿", "🦋", "🔥", "🌙", "⭐", "🐾", "💫"];

// ─── 마크다운 렌더러 ──────────────────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("# "))
      return <h1 key={i} className="text-3xl font-bold text-gray-900 mt-8 mb-4 leading-tight">{line.slice(2)}</h1>;
    if (line.startsWith("## "))
      return <h2 key={i} className="text-xl font-bold text-gray-800 mt-7 mb-3">{line.slice(3)}</h2>;
    if (line.startsWith("### "))
      return <h3 key={i} className="text-lg font-semibold text-gray-800 mt-5 mb-2">{line.slice(4)}</h3>;
    if (line.startsWith("> "))
      return <blockquote key={i} className="border-l-4 border-gray-300 pl-4 my-4 text-gray-500 italic text-lg">{inlineStyles(line.slice(2))}</blockquote>;
    if (line.startsWith("---"))
      return <hr key={i} className="border-gray-200 my-8" />;
    if (line.startsWith("- "))
      return <li key={i} className="text-gray-700 text-base leading-8 ml-5 list-disc">{inlineStyles(line.slice(2))}</li>;
    if (line.trim() === "")
      return <div key={i} className="h-3" />;
    return <p key={i} className="text-gray-700 text-[17px] leading-9">{inlineStyles(line)}</p>;
  });
}

function inlineStyles(text) {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={match.index}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={match.index}>{match[3]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 앱
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const [view, setView] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [draft, setDraft] = useState({ title: "", content: "", music: "", image: "", tags: "" });
  const [profileTarget, setProfileTarget] = useState(null);
  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    // URL에 reset_token 파라미터가 있으면 비번 재설정 모달 표시
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset_token");
    if (token) { setResetToken(token); window.history.replaceState({}, "", "/"); }

    const savedToken = localStorage.getItem("geulter_token");
    const savedUser = localStorage.getItem("geulter_user");
    if (savedToken && savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      api.get("/api/auth/me")
        .then((user) => {
          setCurrentUser(user);
          localStorage.setItem("geulter_user", JSON.stringify(user));
        })
        .catch(() => {
          localStorage.removeItem("geulter_token");
          localStorage.removeItem("geulter_user");
          setCurrentUser(null);
        });
    }
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setPostsLoading(true);
    try {
      const data = await api.get("/api/posts");
      setPosts(data);
    } catch (e) {
      console.error("글 로드 실패:", e);
    } finally {
      setPostsLoading(false);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const { user, token } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("geulter_token", token);
      localStorage.setItem("geulter_user", JSON.stringify(user));
      setCurrentUser(user);
      setAuthModal(null);
      return null;
    } catch (e) { return e.message; }
  };

  const handleSignup = async (name, email, password, role, avatar) => {
    try {
      const { user, token } = await api.post("/api/auth/register", { name, email, password, role, avatar });
      localStorage.setItem("geulter_token", token);
      localStorage.setItem("geulter_user", JSON.stringify(user));
      setCurrentUser(user);
      setAuthModal(null);
      return null;
    } catch (e) { return e.message; }
  };

  const handleLogout = () => {
    localStorage.removeItem("geulter_token");
    localStorage.removeItem("geulter_user");
    setCurrentUser(null);
    setView("feed");
  };

  const handleDeleteAccount = async () => {
    try {
      await api.delete("/api/auth/account");
      handleLogout();
    } catch (e) { alert(e.message); }
  };

  const openWrite = (postToEdit = null) => {
    setEditingPost(postToEdit);
    setDraft(postToEdit
      ? { title: postToEdit.title, content: postToEdit.content, music: postToEdit.music?.title || "", image: postToEdit.image || "", tags: postToEdit.tags.join(", ") }
      : { title: "", content: "", music: "", image: "", tags: "" }
    );
    setView("write");
  };

  const handlePublish = async () => {
    if (!draft.title.trim() || !draft.content.trim()) return;
    const payload = {
      title: draft.title, content: draft.content,
      image: draft.image || null,
      music_title: draft.music || null,
      tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (editingPost) {
        const updated = await api.put(`/api/posts/${editingPost.id}`, payload);
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSelectedPost(updated);
        setView("post");
      } else {
        const newPost = await api.post("/api/posts", payload);
        setPosts((prev) => [newPost, ...prev]);
        setView("feed");
      }
      setDraft({ title: "", content: "", music: "", image: "", tags: "" });
      setEditingPost(null);
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (postId) => {
    try {
      await api.delete(`/api/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setView("feed");
    } catch (e) { alert(e.message); }
  };

  const isWriter = currentUser?.role === "writer";
  const isAdmin = !!currentUser?.is_admin;
  const isPending = currentUser?.role === "writer" && currentUser?.status === "pending";

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Georgia', serif" }}>
      <Header
        currentUser={currentUser} isWriter={isWriter} isAdmin={isAdmin}
        onLogoClick={() => setView("feed")}
        onLoginClick={() => setAuthModal("login")}
        onWriteClick={() => openWrite()}
        onLogout={handleLogout}
        onProfileClick={() => { setProfileTarget(currentUser.id); setView("profile"); }}
        onAdminClick={() => setView("admin")}
      />

      {/* 작가 승인 대기 배너 */}
      {isPending && view === "feed" && (
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 font-sans">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <span className="text-amber-500 text-lg">⏳</span>
            <p className="text-sm text-amber-700">
              <span className="font-semibold">승인 대기 중이에요.</span>{" "}
              관리자가 작가 신청을 검토 중입니다. 승인 후 글을 발행할 수 있어요.
            </p>
          </div>
        </div>
      )}

      {view === "feed" && (
        <FeedView posts={posts} loading={postsLoading} currentUser={currentUser} isWriter={isWriter && !isPending}
          onPostClick={(p) => { setSelectedPost(p); setView("post"); setIsPlaying(false); }}
          onAuthorClick={(id) => { setProfileTarget(id); setView("profile"); }}
          onLoginPrompt={() => setAuthModal("login")}
          onWriteClick={() => openWrite()} />
      )}
      {view === "post" && selectedPost && (
        <PostView post={posts.find((p) => p.id === selectedPost.id) || selectedPost}
          currentUser={currentUser} isAdmin={isAdmin} isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((v) => !v)}
          onBack={() => setView("feed")}
          onEdit={() => openWrite(posts.find((p) => p.id === selectedPost.id) || selectedPost)}
          onDelete={handleDelete}
          onAuthorClick={(id) => { setProfileTarget(id); setView("profile"); }} />
      )}
      {view === "write" && isWriter && !isPending && (
        <WriteView draft={draft} editingPost={editingPost}
          onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
          onPublish={handlePublish}
          onBack={() => { setEditingPost(null); setView(editingPost ? "post" : "feed"); }} />
      )}
      {view === "profile" && (
        <ProfileView userId={profileTarget} currentUser={currentUser}
          onPostClick={(p) => { setSelectedPost(p); setView("post"); setIsPlaying(false); }}
          onBack={() => setView("feed")}
          onDeleteAccount={handleDeleteAccount} />
      )}
      {view === "admin" && isAdmin && (
        <AdminView currentUser={currentUser} onBack={() => setView("feed")} />
      )}
      {authModal && authModal !== "forgot" && (
        <AuthModal mode={authModal} onSwitchMode={(m) => setAuthModal(m)}
          onLogin={handleLogin} onSignup={handleSignup} onClose={() => setAuthModal(null)}
          onForgotPassword={() => setAuthModal("forgot")} />
      )}
      {authModal === "forgot" && (
        <ForgotPasswordModal onClose={() => setAuthModal(null)} />
      )}
      {resetToken && (
        <ResetPasswordModal token={resetToken} onClose={() => setResetToken(null)} onDone={() => { setResetToken(null); setAuthModal("login"); }} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 헤더
// ══════════════════════════════════════════════════════════════════════════════
function Header({ currentUser, isWriter, isAdmin, onLogoClick, onLoginClick, onWriteClick, onLogout, onProfileClick, onAdminClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
        <button onClick={onLogoClick} className="text-xl font-bold tracking-tight text-gray-900 hover:text-gray-500 transition-colors">
          글터 <span className="text-gray-300 mx-1 font-light">|</span>
          <span className="text-sm font-normal text-gray-400">Geulter</span>
        </button>
        <div className="flex items-center gap-2 font-sans">
          {currentUser ? (
            <>
              {isWriter && (
                <button onClick={onWriteClick} className="text-xs px-4 py-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-all">+ 새 글</button>
              )}
              {isAdmin && (
                <button onClick={onAdminClick} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-all">⚙ 관리</button>
              )}
              <div className="relative">
                <button onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-50 border border-gray-100 transition-colors">
                  <span className="text-lg">{currentUser.avatar}</span>
                  <span className="text-sm text-gray-700 font-medium">{currentUser.name}</span>
                  <span className="text-[10px] text-gray-400">▾</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 text-sm z-50">
                    <div className="px-4 py-2.5 border-b border-gray-50">
                      <p className="font-semibold text-gray-800 text-sm">{currentUser.name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{currentUser.email}</p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full inline-block ${isWriter ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-500"}`}>
                          {isWriter ? "✍️ 작가" : "👁 독자"}
                        </span>
                        {isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full inline-block bg-indigo-50 text-indigo-600">👑 어드민</span>}
                        {currentUser.status === "pending" && <span className="text-[10px] px-2 py-0.5 rounded-full inline-block bg-amber-50 text-amber-600">⏳ 승인 대기</span>}
                      </div>
                    </div>
                    <button onClick={() => { onProfileClick(); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-600">내 프로필</button>
                    {isWriter && <button onClick={() => { onWriteClick(); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-gray-600">새 글 쓰기</button>}
                    {isAdmin && <button onClick={() => { onAdminClick(); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-indigo-600">⚙ 관리 페이지</button>}
                    <button onClick={() => { onLogout(); setMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-red-400">로그아웃</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={onLoginClick} className="text-sm px-4 py-1.5 border border-gray-200 rounded-full hover:border-gray-500 text-gray-600 transition-all">로그인</button>
          )}
        </div>
      </div>
    </header>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 인증 모달
// ══════════════════════════════════════════════════════════════════════════════
function AuthModal({ mode, onSwitchMode, onLogin, onSignup, onClose, onForgotPassword }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [name, setName] = useState(""); const [role, setRole] = useState("reader");
  const [avatar, setAvatar] = useState("🌸"); const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    let err;
    if (mode === "login") { err = await onLogin(email, password); }
    else {
      if (!name.trim()) { setError("이름을 입력하세요."); setLoading(false); return; }
      err = await onSignup(name, email, password, role, avatar);
    }
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-8 pt-7 pb-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{mode === "login" ? "다시 만나서 반가워요" : "글터에 오신 걸 환영해요"}</h2>
            <p className="text-sm text-gray-400 mt-1 font-sans">{mode === "login" ? "계속 이야기를 써 내려가요" : "당신의 이야기를 시작해보세요"}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-2xl font-sans leading-none mt-1">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4 font-sans">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">이름</label>
                <input type="text" placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">아바타</label>
                <div className="flex flex-wrap gap-2">
                  {AVATARS.map((a) => (
                    <button key={a} type="button" onClick={() => setAvatar(a)}
                      className={`w-9 h-9 rounded-full text-lg flex items-center justify-center transition-all ${avatar === a ? "bg-gray-900 scale-110 shadow-md" : "bg-gray-100 hover:bg-gray-200"}`}>{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">역할</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ value: "reader", icon: "👁", label: "독자", desc: "글을 읽고 즐겨요" }, { value: "writer", icon: "✍️", label: "작가", desc: "글을 쓰고 발행해요" }].map((r) => (
                    <button key={r.value} type="button" onClick={() => setRole(r.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${role === r.value ? "border-gray-900 bg-gray-50" : "border-gray-100 hover:border-gray-300"}`}>
                      <p className="text-lg mb-1">{r.icon}</p>
                      <p className="text-sm font-semibold text-gray-800">{r.label}</p>
                      <p className="text-xs text-gray-400">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">이메일</label>
            <input type="email" placeholder="hello@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">비밀번호</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-all disabled:opacity-50">
            {loading ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
          </button>
          <p className="text-center text-xs text-gray-400">
            {mode === "login" ? (
              <>
                <button type="button" onClick={onForgotPassword} className="text-gray-500 hover:text-gray-700 underline mr-3">비밀번호 찾기</button>
                아직 계정이 없으신가요? <button type="button" onClick={() => { onSwitchMode("signup"); setError(""); }} className="text-gray-800 underline">회원가입</button>
              </>
            ) : (
              <>이미 계정이 있으신가요? <button type="button" onClick={() => { onSwitchMode("login"); setError(""); }} className="text-gray-800 underline">로그인</button></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 비밀번호 찾기 모달
// ══════════════════════════════════════════════════════════════════════════════
function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email });
      setDone(true);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-8 pt-7 pb-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">비밀번호 찾기</h2>
            <p className="text-sm text-gray-400 mt-1 font-sans">가입한 이메일로 재설정 링크를 보내드려요</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-2xl font-sans leading-none mt-1">×</button>
        </div>
        <div className="px-8 py-6 font-sans">
          {done ? (
            <div className="text-center py-4">
              <p className="text-4xl mb-3">📬</p>
              <p className="text-sm font-medium text-gray-700 mb-1">이메일을 확인해 주세요</p>
              <p className="text-xs text-gray-400">등록된 이메일이라면 재설정 링크가 발송됐어요.</p>
              <button onClick={onClose} className="mt-5 text-xs px-5 py-2 bg-gray-900 text-white rounded-full">확인</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">이메일</label>
                <input type="email" placeholder="hello@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-all disabled:opacity-50">
                {loading ? "전송 중…" : "재설정 링크 보내기"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 비밀번호 재설정 모달 (URL 토큰으로 진입)
// ══════════════════════════════════════════════════════════════════════════════
function ResetPasswordModal({ token, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault(); setError("");
    if (password !== confirm) return setError("비밀번호가 일치하지 않아요.");
    if (password.length < 4) return setError("4자 이상 입력하세요.");
    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, newPassword: password });
      onDone();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-8 pt-7 pb-0">
          <h2 className="text-xl font-bold text-gray-900">새 비밀번호 설정</h2>
          <p className="text-sm text-gray-400 mt-1 font-sans">새로 사용할 비밀번호를 입력해 주세요</p>
        </div>
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4 font-sans">
          <div>
            <label className="block text-xs text-gray-500 mb-1">새 비밀번호</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">비밀번호 확인</label>
            <input type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-all disabled:opacity-50">
            {loading ? "변경 중…" : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 히어로 배너
// ══════════════════════════════════════════════════════════════════════════════
function HeroBanner({ currentUser, isWriter, postCount, onLoginPrompt, onWriteClick }) {
  return (
    <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
      {/* 배경 dot 장식 */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
        backgroundSize: "48px 48px"
      }} />
      <div className="relative z-10 max-w-5xl mx-auto px-5 py-20 text-center">
        <p className="text-xs tracking-widest text-blue-300 mb-4 font-sans uppercase">글로 연결되는 공간</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-5 leading-tight">
          당신의 이야기를<br />써내려가세요
        </h1>
        <p className="text-base text-gray-400 mb-8 font-sans max-w-md mx-auto leading-relaxed">
          누군가의 하루가 담긴 글, 오늘도 이곳에서 이어집니다.
        </p>
        <div className="flex items-center justify-center gap-4">
          {!currentUser ? (
            <button onClick={onLoginPrompt}
              className="px-7 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-all font-sans shadow-lg">
              글터 시작하기
            </button>
          ) : isWriter ? (
            <button onClick={onWriteClick}
              className="px-7 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-all font-sans shadow-lg">
              ✍️ 새 글 쓰기
            </button>
          ) : null}
          {postCount > 0 && (
            <span className="text-sm text-gray-500 font-sans">글 {postCount}편</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 피드 뷰
// ══════════════════════════════════════════════════════════════════════════════
function FeedView({ posts, loading, currentUser, isWriter, onPostClick, onAuthorClick, onLoginPrompt, onWriteClick }) {
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div>
      <HeroBanner
        currentUser={currentUser}
        isWriter={isWriter}
        postCount={posts.length}
        onLoginPrompt={onLoginPrompt}
        onWriteClick={onWriteClick}
      />
      <main className="max-w-5xl mx-auto px-5 py-12">
        {loading ? (
          <div>
            <div className="animate-pulse mb-12 flex flex-col sm:flex-row gap-8">
              <div className="w-full sm:w-96 h-64 bg-gray-100 rounded-2xl flex-shrink-0" />
              <div className="flex-1 py-2 space-y-3">
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-7 bg-gray-100 rounded w-2/3" />
                <div className="h-7 bg-gray-100 rounded w-1/2" />
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-4/5" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="w-full h-44 bg-gray-100 rounded-xl mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-1/3 mb-2" />
                  <div className="h-5 bg-gray-100 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-sans">
            <p className="text-5xl mb-4">✍️</p>
            <p className="text-base font-medium text-gray-500">아직 글이 없어요</p>
            <p className="text-sm mt-1">작가로 가입하면 첫 번째 글을 올릴 수 있어요</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured && (
              <div className="mb-14">
                <div className="flex items-center gap-2 mb-6">
                  <span className="w-5 h-0.5 bg-gray-900 inline-block" />
                  <span className="text-xs font-semibold text-gray-900 tracking-widest uppercase font-sans">Featured</span>
                </div>
                <PostCard post={featured} variant="featured" currentUser={currentUser}
                  onClick={() => onPostClick(featured)} onAuthorClick={onAuthorClick} />
              </div>
            )}
            {/* Grid */}
            {rest.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <span className="w-5 h-0.5 bg-gray-900 inline-block" />
                  <span className="text-xs font-semibold text-gray-900 tracking-widest uppercase font-sans">최신 글</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
                  {rest.map((post) => (
                    <PostCard key={post.id} post={post} variant="grid" currentUser={currentUser}
                      onClick={() => onPostClick(post)} onAuthorClick={onAuthorClick} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PostCard({ post, variant = "grid", currentUser, onClick, onAuthorClick }) {
  const [liked, setLiked] = useState(false);
  const isMyPost = currentUser?.id === post.authorId;

  if (variant === "featured") {
    return (
      <article className="group cursor-pointer" onClick={onClick}>
        <div className="flex flex-col sm:flex-row gap-8 items-start">
          {/* 이미지 */}
          <div className="overflow-hidden rounded-2xl flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center"
            style={{ width: "100%", maxWidth: "460px", height: "280px" }}>
            {post.image
              ? <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              : <span className="text-6xl opacity-20">✍️</span>
            }
          </div>
          {/* 텍스트 */}
          <div className="flex-1 min-w-0 flex flex-col justify-center py-2">
            <div className="flex items-center gap-2 mb-4 font-sans">
              <button className="text-lg hover:scale-110 transition-transform" onClick={(e) => { e.stopPropagation(); onAuthorClick(post.authorId); }}>{post.author.avatar}</button>
              <button className="text-sm font-medium text-gray-700 hover:underline" onClick={(e) => { e.stopPropagation(); onAuthorClick(post.authorId); }}>{post.author.name}</button>
              {isMyPost && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">내 글</span>}
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{post.date}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-gray-500 transition-colors leading-snug mb-4">{post.title}</h2>
            <p className="text-gray-500 text-base leading-relaxed mb-5 font-sans line-clamp-3">{post.excerpt}</p>
            <div className="flex items-center gap-3 text-xs text-gray-400 font-sans flex-wrap">
              {post.music && <span className="text-purple-400">🎵 {post.music.title}</span>}
              <span>⏱ {post.readTime}</span>
              <button className={`flex items-center gap-1 hover:text-red-400 transition-colors ${liked ? "text-red-400" : ""}`}
                onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }}>
                {liked ? "❤️" : "🤍"} {post.likes + (liked ? 1 : 0)}
              </button>
              {post.tags.slice(0, 2).map((tag) => <span key={tag} className="bg-gray-100 px-2 py-0.5 rounded-full">{tag}</span>)}
            </div>
          </div>
        </div>
      </article>
    );
  }

  // grid variant
  return (
    <article className="group cursor-pointer flex flex-col" onClick={onClick}>
      <div className="overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 mb-4 flex items-center justify-center" style={{ height: "180px" }}>
        {post.image
          ? <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <span className="text-4xl opacity-20">✍️</span>
        }
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-1.5 mb-2 font-sans">
          <button className="text-sm hover:scale-110 transition-transform" onClick={(e) => { e.stopPropagation(); onAuthorClick(post.authorId); }}>{post.author.avatar}</button>
          <button className="text-xs font-medium text-gray-600 hover:underline" onClick={(e) => { e.stopPropagation(); onAuthorClick(post.authorId); }}>{post.author.name}</button>
          {isMyPost && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">내 글</span>}
          <span className="text-gray-300 text-xs">·</span>
          <span className="text-[11px] text-gray-400">{post.date}</span>
        </div>
        <h3 className="text-base font-bold text-gray-900 group-hover:text-gray-500 transition-colors leading-snug mb-2 line-clamp-2">{post.title}</h3>
        <p className="text-gray-400 text-xs leading-relaxed line-clamp-2 mb-3 font-sans flex-1">{post.excerpt}</p>
        <div className="flex items-center gap-2 text-[11px] text-gray-400 font-sans flex-wrap">
          <span>⏱ {post.readTime}</span>
          <button className={`flex items-center gap-0.5 hover:text-red-400 transition-colors ${liked ? "text-red-400" : ""}`}
            onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }}>
            {liked ? "❤️" : "🤍"} {post.likes + (liked ? 1 : 0)}
          </button>
          {post.tags.slice(0, 1).map((tag) => <span key={tag} className="bg-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>)}
        </div>
      </div>
    </article>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 글 읽기 뷰
// ══════════════════════════════════════════════════════════════════════════════
function PostView({ post, currentUser, isAdmin, isPlaying, onTogglePlay, onBack, onEdit, onDelete, onAuthorClick }) {
  const [subscribed, setSubscribed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isMyPost = currentUser?.id === post.authorId;
  const canEdit = isMyPost;
  const canDelete = isMyPost || isAdmin;
  const bars = [6, 10, 14, 9, 12, 7, 15, 8, 11, 6, 13, 9];

  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <div className="flex items-center justify-between mb-8 font-sans">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors">← 목록으로</button>
        {(canEdit || canDelete) && (
          <div className="flex gap-2">
            {canEdit && <button onClick={onEdit} className="text-xs px-3 py-1.5 border border-gray-200 rounded-full hover:border-gray-500 text-gray-500 transition-all">✏️ 수정</button>}
            {canDelete && <button onClick={() => setShowDeleteConfirm(true)} className="text-xs px-3 py-1.5 border border-red-200 rounded-full hover:bg-red-50 text-red-400 transition-all">🗑 삭제</button>}
          </div>
        )}
      </div>
      {showDeleteConfirm && (
        <div className="mb-6 bg-red-50 border border-red-100 rounded-xl px-5 py-4 font-sans">
          <p className="text-sm font-medium text-red-700 mb-3">이 글을 삭제할까요? 되돌릴 수 없어요.</p>
          <div className="flex gap-2">
            <button onClick={() => onDelete(post.id)} className="text-xs px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600">삭제하기</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs px-4 py-2 border border-gray-200 rounded-full text-gray-500">취소</button>
          </div>
        </div>
      )}
      {post.music && (
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 px-5 py-4 flex items-center gap-4">
          <button onClick={onTogglePlay} className="w-11 h-11 rounded-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center flex-shrink-0 transition-colors">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-purple-400 mb-0.5 font-sans">이 글과 함께 들으면 좋아요</p>
            <p className="text-sm font-medium text-gray-700 truncate font-sans">🎵 {post.music.title}</p>
            {isPlaying && (
              <div className="flex items-end gap-0.5 h-4 mt-2">
                {bars.map((h, i) => (
                  <div key={i} className="w-1 rounded-sm bg-purple-400"
                    style={{ height: `${h}px`, animation: "pulse 0.8s ease-in-out infinite alternate", animationDelay: `${i * 0.07}s` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-4 flex-wrap font-sans">
        {post.tags.map((tag) => <span key={tag} className="text-xs text-purple-500 bg-purple-50 px-2.5 py-1 rounded-full">#{tag}</span>)}
      </div>
      <div className="flex items-center gap-3 mb-8 pb-7 border-b border-gray-100 font-sans">
        <button onClick={() => onAuthorClick(post.authorId)} className="text-3xl hover:scale-110 transition-transform">{post.author.avatar}</button>
        <div>
          <button onClick={() => onAuthorClick(post.authorId)} className="text-sm font-semibold text-gray-800 hover:underline">{post.author.name}</button>
          <p className="text-xs text-gray-400">{post.author.bio}</p>
        </div>
        <div className="ml-auto text-xs text-gray-400 text-right"><p>{post.date}</p><p>{post.readTime} 읽기</p></div>
      </div>
      {post.image && (
        <div className="mb-8 rounded-2xl overflow-hidden">
          <img src={post.image} alt={post.title} className="w-full h-72 object-cover" />
        </div>
      )}
      <div className="mt-2">{renderMarkdown(post.content)}</div>
      <CommentSection postId={post.id} currentUser={currentUser} />
      <div className="mt-14 pt-8 border-t border-gray-100 flex items-center justify-between font-sans">
        <div className="flex items-center gap-3">
          <button onClick={() => onAuthorClick(post.authorId)} className="text-4xl hover:scale-110 transition-transform">{post.author.avatar}</button>
          <div>
            <button onClick={() => onAuthorClick(post.authorId)} className="font-semibold text-sm text-gray-800 hover:underline">{post.author.name}</button>
            <p className="text-xs text-gray-400 mt-0.5">{post.author.bio}</p>
          </div>
        </div>
        {currentUser && !isMyPost && (
          <button onClick={() => setSubscribed((v) => !v)}
            className={`text-sm px-4 py-2 rounded-full border transition-all ${subscribed ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:border-gray-500 text-gray-600"}`}>
            {subscribed ? "✓ 구독 중" : "구독하기 +"}
          </button>
        )}
      </div>
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 글쓰기 에디터
// ══════════════════════════════════════════════════════════════════════════════
const TOOLBAR_ITEMS = [
  { label: "H1", title: "제목 1", action: "heading1" },
  { label: "H2", title: "제목 2", action: "heading2" },
  { label: "H3", title: "제목 3", action: "heading3" },
  { label: "B",  title: "굵게",   action: "bold",    className: "font-bold" },
  { label: "I",  title: "기울임", action: "italic",  className: "italic" },
  { label: "❝", title: "인용",   action: "quote" },
  { label: "—",  title: "구분선", action: "hr" },
  { label: "•",  title: "목록",   action: "list" },
];

function WriteView({ draft, editingPost, onChange, onPublish, onBack }) {
  const [tab, setTab] = useState("write");
  const [showImg, setShowImg] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [imgInput, setImgInput] = useState("");
  const [musicInput, setMusicInput] = useState("");
  const [publishing, setPublishing] = useState(false);
  const textareaRef = useRef(null);

  const readTime = Math.max(1, Math.ceil(draft.content.length / 300));
  const canPublish = draft.title.trim() && draft.content.trim();
  const applyImage = () => { onChange("image", imgInput); setShowImg(false); setImgInput(""); };
  const applyMusic = () => { onChange("music", musicInput); setShowMusic(false); setMusicInput(""); };

  const handlePublish = async () => { setPublishing(true); await onPublish(); setPublishing(false); };

  const handleToolbar = useCallback((action) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const val = draft.content, sel = val.slice(start, end);
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    let newVal = val, cursor = start;
    if (action === "bold") { newVal = val.slice(0, start) + `**${sel || "텍스트"}**` + val.slice(end); cursor = start + 2 + (sel || "텍스트").length + 2; }
    else if (action === "italic") { newVal = val.slice(0, start) + `*${sel || "텍스트"}*` + val.slice(end); cursor = start + 1 + (sel || "텍스트").length + 1; }
    else if (action === "heading1") { newVal = val.slice(0, lineStart) + "# " + val.slice(lineStart); cursor = start + 2; }
    else if (action === "heading2") { newVal = val.slice(0, lineStart) + "## " + val.slice(lineStart); cursor = start + 3; }
    else if (action === "heading3") { newVal = val.slice(0, lineStart) + "### " + val.slice(lineStart); cursor = start + 4; }
    else if (action === "quote") { newVal = val.slice(0, lineStart) + "> " + val.slice(lineStart); cursor = start + 2; }
    else if (action === "hr") { const ins = "\n---\n"; newVal = val.slice(0, start) + ins + val.slice(end); cursor = start + ins.length; }
    else if (action === "list") { newVal = val.slice(0, lineStart) + "- " + val.slice(lineStart); cursor = start + 2; }
    onChange("content", newVal);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
  }, [draft.content, onChange]);

  return (
    <main className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 font-sans">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← 취소</button>
          <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
            {["write", "preview"].map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-xs px-3 py-1.5 rounded-full transition-all ${tab === t ? "bg-white shadow-sm text-gray-800 font-medium" : "text-gray-400 hover:text-gray-600"}`}>
                {t === "write" ? "✏️ 쓰기" : "👁 미리보기"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {editingPost && <span className="text-xs text-amber-500 bg-amber-50 px-2.5 py-1 rounded-full">수정 중</span>}
          {draft.content && <span className="text-xs text-gray-400">약 {readTime}분</span>}
          <button onClick={handlePublish} disabled={!canPublish || publishing}
            className="text-sm px-5 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
            {publishing ? "저장 중…" : editingPost ? "수정 완료" : "발행하기"}
          </button>
        </div>
      </div>
      <input type="text" placeholder="제목을 입력하세요" value={draft.title} onChange={(e) => onChange("title", e.target.value)}
        className="w-full text-[26px] font-bold text-gray-900 placeholder-gray-200 outline-none bg-transparent mb-5 pb-4"
        style={{ border: "none", borderBottom: "1px solid #f3f4f6" }} />
      <div className="flex items-center gap-2 mb-4 font-sans flex-wrap">
        <button onClick={() => { setShowImg((v) => !v); setShowMusic(false); }}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showImg ? "bg-gray-900 text-white border-gray-900" : "text-gray-400 border-gray-200 hover:border-gray-500"}`}>📷 사진</button>
        <button onClick={() => { setShowMusic((v) => !v); setShowImg(false); }}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showMusic ? "bg-purple-500 text-white border-purple-500" : "text-gray-400 border-gray-200 hover:border-gray-500"}`}>🎵 음악</button>
        {draft.image && <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">🖼 사진 첨부됨 <button className="ml-1 text-red-300 hover:text-red-500" onClick={() => onChange("image", "")}>×</button></span>}
        {draft.music && <span className="text-xs text-purple-500 bg-purple-50 px-2.5 py-1 rounded-full">🎵 {draft.music} <button className="ml-1 text-red-300 hover:text-red-500" onClick={() => onChange("music", "")}>×</button></span>}
      </div>
      {showImg && (
        <div className="flex gap-2 mb-4 font-sans">
          <input type="url" placeholder="이미지 URL (https://...)" value={imgInput} onChange={(e) => setImgInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyImage()}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400" />
          <button onClick={applyImage} className="text-xs px-4 py-2 bg-gray-900 text-white rounded-xl">확인</button>
        </div>
      )}
      {showMusic && (
        <div className="flex gap-2 mb-4 font-sans">
          <input type="text" placeholder="곡명 입력 (예: Spring Day - BTS)" value={musicInput} onChange={(e) => setMusicInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyMusic()}
            className="flex-1 text-sm border border-purple-200 rounded-xl px-3 py-2 outline-none focus:border-purple-400" />
          <button onClick={applyMusic} className="text-xs px-4 py-2 bg-purple-500 text-white rounded-xl">확인</button>
        </div>
      )}
      {draft.image && (
        <div className="relative mb-4 rounded-2xl overflow-hidden">
          <img src={draft.image} alt="cover" className="w-full h-44 object-cover" />
          <button onClick={() => onChange("image", "")}
            className="absolute top-3 right-3 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm hover:bg-black/70">×</button>
        </div>
      )}
      {tab === "write" ? (
        <>
          <div className="flex items-center gap-1 mb-3 p-2 bg-gray-50 rounded-xl font-sans flex-wrap">
            {TOOLBAR_ITEMS.map((item) => (
              <button key={item.action} title={item.title} onClick={() => handleToolbar(item.action)}
                className={`w-8 h-8 rounded-lg text-sm text-gray-600 hover:bg-white hover:shadow-sm transition-all flex items-center justify-center ${item.className || ""}`}>{item.label}</button>
            ))}
            <span className="text-gray-200 mx-1">|</span>
            <span className="text-xs text-gray-400">마크다운 지원</span>
          </div>
          <textarea ref={textareaRef}
            placeholder={"당신의 이야기를 써주세요…\n\n# 제목\n## 소제목\n\n**굵게**, *기울임*, > 인용, --- 구분선"}
            value={draft.content} onChange={(e) => onChange("content", e.target.value)}
            className="w-full min-h-96 text-[16px] text-gray-700 placeholder-gray-200 outline-none resize-none bg-transparent leading-8 font-sans"
            style={{ border: "none" }} />
        </>
      ) : (
        <div className="min-h-96 border border-gray-100 rounded-2xl p-6 bg-white">
          {draft.content ? renderMarkdown(draft.content) : <p className="text-gray-300 font-sans text-sm">내용을 입력하면 미리보기가 표시됩니다.</p>}
        </div>
      )}
      <div className="mt-6 pt-5 border-t border-gray-100 font-sans">
        <input type="text" placeholder="태그 입력 (쉼표로 구분: 일상, 에세이)" value={draft.tags} onChange={(e) => onChange("tags", e.target.value)}
          className="w-full text-sm text-gray-500 placeholder-gray-300 outline-none bg-transparent" style={{ border: "none" }} />
        {draft.tags && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {draft.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 프로필 뷰
// ══════════════════════════════════════════════════════════════════════════════
function ProfileView({ userId, currentUser, onPostClick, onBack, onDeleteAccount }) {
  const [user, setUser] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const isMe = currentUser?.id === userId;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([api.get(`/api/users/${userId}`), api.get(`/api/users/${userId}/posts`)])
      .then(([u, posts]) => { setUser(u); setUserPosts(posts); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <main className="max-w-2xl mx-auto px-5 py-10 font-sans">
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-100 rounded w-20" />
        <div className="h-32 bg-gray-100 rounded-2xl" />
      </div>
    </main>
  );

  if (!user) return (
    <main className="max-w-2xl mx-auto px-5 py-10 font-sans">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 mb-8">← 돌아가기</button>
      <p className="text-gray-400">존재하지 않는 프로필입니다.</p>
    </main>
  );

  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 mb-8 font-sans">← 돌아가기</button>
      <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 mb-10 border border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <span className="text-6xl">{user.avatar}</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
                {isMe && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-sans">나</span>}
              </div>
              <p className="text-sm text-gray-500 font-sans">{user.bio}</p>
              <div className="flex items-center gap-3 mt-2 font-sans">
                <span className={`text-xs px-2.5 py-1 rounded-full ${user.role === "writer" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-500"}`}>
                  {user.role === "writer" ? "✍️ 작가" : "👁 독자"}
                </span>
                <span className="text-xs text-gray-400">{new Date(user.created_at).toLocaleDateString("ko-KR")} 가입</span>
              </div>
            </div>
          </div>
          {currentUser && !isMe && (
            <button onClick={() => setSubscribed((v) => !v)}
              className={`text-sm px-4 py-2 rounded-full border transition-all font-sans ${subscribed ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:border-gray-500 text-gray-600"}`}>
              {subscribed ? "✓ 구독 중" : "구독하기 +"}
            </button>
          )}
        </div>
        {user.role === "writer" && (
          <div className="flex gap-6 mt-6 pt-5 border-t border-gray-100 font-sans">
            <div className="text-center"><p className="text-xl font-bold text-gray-900">{userPosts.length}</p><p className="text-xs text-gray-400">글</p></div>
            <div className="text-center"><p className="text-xl font-bold text-gray-900">{userPosts.reduce((s, p) => s + p.likes, 0)}</p><p className="text-xs text-gray-400">좋아요</p></div>
          </div>
        )}
        {isMe && (
          <div className="mt-5 pt-4 border-t border-gray-100 font-sans">
            {!showDeleteAccount ? (
              <button onClick={() => setShowDeleteAccount(true)} className="text-xs text-gray-400 hover:text-red-400 transition-colors">회원 탈퇴</button>
            ) : (
              <div className="bg-red-50 rounded-xl p-4">
                <p className="text-sm font-medium text-red-700 mb-1">정말 탈퇴하시겠어요?</p>
                <p className="text-xs text-red-400 mb-3">작성한 글이 모두 삭제되며 되돌릴 수 없어요.</p>
                <div className="flex gap-2">
                  <button onClick={onDeleteAccount} className="text-xs px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600">탈퇴하기</button>
                  <button onClick={() => setShowDeleteAccount(false)} className="text-xs px-4 py-2 border border-gray-200 rounded-full text-gray-500">취소</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {user.role === "writer" ? (
        <>
          <h3 className="text-lg font-bold text-gray-900 mb-5">
            {isMe ? "내가 쓴 글" : `${user.name}의 글`}
            <span className="text-sm font-normal text-gray-400 ml-2 font-sans">{userPosts.length}편</span>
          </h3>
          {userPosts.length === 0 ? (
            <div className="text-center py-16 text-gray-400 font-sans"><p className="text-4xl mb-3">✍️</p><p className="text-sm">아직 작성한 글이 없어요</p></div>
          ) : (
            <div className="space-y-5">
              {userPosts.map((post) => (
                <article key={post.id} className="flex gap-4 cursor-pointer group" onClick={() => onPostClick(post)}>
                  {post.image && (
                    <div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-800 group-hover:text-gray-500 transition-colors text-base leading-snug">{post.title}</h4>
                    <div className="flex items-center gap-2 mt-1 font-sans text-xs text-gray-400">
                      <span>{post.date}</span><span>·</span><span>{post.readTime}</span>
                      <span>·</span><span>🤍 {post.likes}</span>
                      {post.music && <span className="text-purple-400">🎵</span>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-gray-400 font-sans"><p className="text-4xl mb-3">👁</p><p className="text-sm">독자 회원은 글 목록이 없어요</p></div>
      )}
    </main>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// 댓글 섹션
// ══════════════════════════════════════════════════════════════════════════════
function CommentSection({ postId, currentUser }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/api/posts/${postId}/comments`)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const comment = await api.post(`/api/posts/${postId}/comments`, { content: text });
      setComments((prev) => [...prev, comment]);
      setText("");
    } catch (err) { alert(err.message); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/comments/${id}`);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) { alert(err.message); }
  };

  const canComment = currentUser && currentUser.status === "approved";

  return (
    <div className="mt-14 pt-8 border-t border-gray-100 font-sans">
      <h3 className="text-base font-bold text-gray-800 mb-6">
        댓글 <span className="text-gray-400 font-normal text-sm">{comments.length}</span>
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[1,2].map((i) => <div key={i} className="animate-pulse h-14 bg-gray-50 rounded-xl" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
      ) : (
        <div className="space-y-4 mb-8">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 group">
              <span className="text-2xl flex-shrink-0 mt-0.5">{c.author.avatar}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-800">{c.author.name}</span>
                  <span className="text-xs text-gray-400">{c.date}</span>
                  {(currentUser?.id === c.authorId || currentUser?.is_admin) && (
                    <button onClick={() => handleDelete(c.id)}
                      className="text-[11px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-auto">
                      삭제
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {canComment ? (
        <form onSubmit={handleSubmit} className="flex gap-3 items-start">
          <span className="text-2xl flex-shrink-0 mt-1">{currentUser.avatar}</span>
          <div className="flex-1">
            <textarea
              placeholder="댓글을 남겨보세요…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 outline-none focus:border-gray-400 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button type="submit" disabled={!text.trim() || submitting}
                className="text-xs px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-700 disabled:opacity-30 transition-all">
                {submitting ? "등록 중…" : "댓글 달기"}
              </button>
            </div>
          </div>
        </form>
      ) : currentUser ? (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
          ⏳ 관리자 승인 후 댓글을 달 수 있어요.
        </p>
      ) : (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
          로그인 후 댓글을 달 수 있어요.
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 어드민 뷰
// ══════════════════════════════════════════════════════════════════════════════
function AdminView({ currentUser, onBack }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.get("/api/admin/users")
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id) => {
    const updated = await api.put(`/api/admin/users/${id}/approve`, {});
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  };

  const handleReject = async (id) => {
    const updated = await api.put(`/api/admin/users/${id}/reject`, {});
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 유저를 삭제할까요? 작성한 글도 모두 삭제됩니다.")) return;
    await api.delete(`/api/admin/users/${id}`);
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const filtered = users.filter((u) => {
    if (filter === "pending") return u.role === "writer" && u.status === "pending";
    if (filter === "writer") return u.role === "writer";
    if (filter === "reader") return u.role === "reader";
    return true;
  });

  const pendingCount = users.filter((u) => u.role === "writer" && u.status === "pending").length;

  const statusBadge = (u) => {
    if (u.is_admin) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">👑 어드민</span>;
    if (u.status === "pending") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">⏳ 대기</span>;
    if (u.status === "approved") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ 승인</span>;
    if (u.status === "rejected") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-400">✗ 거절</span>;
    return null;
  };

  return (
    <main className="max-w-4xl mx-auto px-5 py-10 font-sans">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 mb-2 block">← 메인으로</button>
          <h1 className="text-2xl font-bold text-gray-900">관리 페이지</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-amber-600 mt-1">⏳ 승인 대기 중인 작가 {pendingCount}명</p>
          )}
        </div>
        <div className="text-right text-sm text-gray-400">
          <p>전체 {users.length}명</p>
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-full p-1 mb-6 w-fit">
        {[
          { key: "all", label: "전체" },
          { key: "pending", label: `대기 ${pendingCount > 0 ? `(${pendingCount})` : ""}` },
          { key: "writer", label: "작가" },
          { key: "reader", label: "독자" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`text-xs px-4 py-1.5 rounded-full transition-all ${filter === tab.key ? "bg-white shadow-sm text-gray-800 font-medium" : "text-gray-500 hover:text-gray-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map((i) => <div key={i} className="animate-pulse h-16 bg-gray-50 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm">해당 유저가 없어요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-all">
              <span className="text-2xl flex-shrink-0">{u.avatar}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{u.name}</span>
                  {statusBadge(u)}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.role === "writer" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-500"}`}>
                    {u.role === "writer" ? "✍️ 작가" : "👁 독자"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {u.role === "writer" && u.status === "pending" && (
                  <>
                    <button onClick={() => handleApprove(u.id)}
                      className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-all">
                      승인
                    </button>
                    <button onClick={() => handleReject(u.id)}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-400 rounded-full hover:bg-red-50 transition-all">
                      거절
                    </button>
                  </>
                )}
                {u.role === "writer" && u.status === "approved" && !u.is_admin && (
                  <button onClick={() => handleReject(u.id)}
                    className="text-xs px-3 py-1.5 border border-gray-200 text-gray-400 rounded-full hover:border-red-300 hover:text-red-400 transition-all">
                    정지
                  </button>
                )}
                {u.role === "writer" && u.status === "rejected" && (
                  <button onClick={() => handleApprove(u.id)}
                    className="text-xs px-3 py-1.5 border border-emerald-200 text-emerald-500 rounded-full hover:bg-emerald-50 transition-all">
                    재승인
                  </button>
                )}
                {!u.is_admin && u.id !== currentUser?.id && (
                  <button onClick={() => handleDelete(u.id)}
                    className="text-xs px-3 py-1.5 border border-gray-100 text-gray-300 rounded-full hover:border-red-200 hover:text-red-400 transition-all">
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
