import { useRef, useState } from 'react';

// Ported from renderPublicPosts() / showPublicPostModal() / savePublicPost() /
// togglePublicPostPublish() / deletePublicPost() / ppHandleImageUpload() /
// ppCompressImage() (index.html ~L28530-28850).
// Table: public_posts. Images upload to Cloudinary matching old app exactly.

interface ImgItem { url: string; caption: string; layout: 'column' | 'break'; }

interface Post {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  image_urls: ImgItem[] | null;
  is_published: boolean;
  author_name: string;
  author_role: string;
  created_at: string;
}

interface Props {
  initialPosts: Post[];
  userId: string;
  userRole: string;
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeImgs(raw: any): ImgItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === 'string'
      ? { url: item, caption: '', layout: 'column' as const }
      : { url: item?.url ?? '', caption: item?.caption ?? '', layout: item?.layout ?? 'column' }
  ).filter((i) => i.url);
}

// Image compression — mirrors ppCompressImage() (index.html ~L28746)
async function compressImage(file: File, maxKB = 900): Promise<File> {
  return new Promise((res) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > 3000) { h = Math.round(h * 3000 / w); w = 3000; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        let q = 0.95;
        const tryQ = () => {
          canvas.toBlob((blob) => {
            if (!blob) { res(file); return; }
            if (blob.size <= maxKB * 1024 || q <= 0.5) {
              res(new File([blob], 'post_img.jpg', { type: 'image/jpeg' }));
            } else { q = Math.max(0.5, q - 0.05); tryQ(); }
          }, 'image/jpeg', q);
        };
        tryQ();
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Upload via server-side proxy — Cloudinary credentials stay in env vars,
// never exposed to the browser. Mirrors ppHandleImageUpload() intent.
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/admin/public-posts/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Upload failed.');
  return data.url;
}

async function apiPost(body: object) {
  const res = await fetch('/api/admin/public-posts/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const field = 'w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white';
const lbl = 'text-xs font-medium text-brand-brown-dark block mb-1';

export default function PublicPosts({ initialPosts, userId, userRole }: Props) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imgs, setImgs] = useState<ImgItem[]>([]);
  const [isPublished, setIsPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function openNew() {
    setEditPost(null); setTitle(''); setContent(''); setImgs([]); setIsPublished(true);
    setError(''); setShowModal(true);
  }

  function openEdit(p: Post) {
    setEditPost(p);
    setTitle(p.title ?? '');
    setContent(p.content ?? '');
    setImgs(normalizeImgs(p.image_urls ?? (p.image_url ? [p.image_url] : [])));
    setIsPublished(p.is_published);
    setError(''); setShowModal(true);
  }

  function closeModal() { setShowModal(false); setError(''); setUploadStatus(''); }

  async function handleImageUpload(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    const arr = [...imgs];
    for (let i = 0; i < files.length; i++) {
      setUploadStatus(`Uploading ${i + 1} of ${files.length}…`);
      try {
        let f = files[i];
        if (f.size > 900 * 1024) f = await compressImage(f, 900);
        const url = await uploadImage(f);
        arr.push({ url, caption: '', layout: 'column' });
        setImgs([...arr]);
      } catch (e) {
        setError(`Failed to upload ${files[i].name}: ` + (e instanceof Error ? e.message : ''));
      }
    }
    setUploadStatus('');
    setUploading(false);
  }

  function removeImg(idx: number) { setImgs((prev) => prev.filter((_, i) => i !== idx)); }
  function updateImgField(idx: number, field: 'caption' | 'layout', val: string) {
    setImgs((prev) => prev.map((im, i) => i === idx ? { ...im, [field]: val } : im));
  }

  async function handleSave() {
    if (!content.trim()) { setError('Post content is required.'); return; }
    if (content.length > 50000) { setError('Content exceeds 50,000 characters.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        action: editPost ? 'update' : 'create',
        id: editPost?.id,
        title: title.trim() || null, content: content.trim(),
        image_url: imgs[0]?.url ?? null,
        image_urls: imgs.length ? imgs : null,
        is_published: isPublished,
        author_name: userRole.replace(/_/g, ' '),
        author_role: userRole,
      };
      const data = await apiPost(payload);
      if (editPost) {
        setPosts((prev) => prev.map((p) => p.id === editPost.id ? data.post : p));
      } else {
        setPosts((prev) => [data.post, ...prev]);
      }
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleTogglePublish(id: string, newState: boolean) {
    setBusyId(id);
    try {
      await apiPost({ action: 'togglePublish', id, is_published: newState });
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, is_published: newState } : p));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setBusyId(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await apiPost({ action: 'delete', id });
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setBusyId(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl text-brand-brown-dark">Public Posts</h1>
          <p className="text-sm text-brand-brown-light">Manage posts visible on the public landing page.</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 rounded-md bg-brand-brown-dark text-white text-sm font-semibold hover:brightness-110">
          + New Post
        </button>
      </div>

      {error && <p className="text-sm text-danger-700">{error}</p>}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg text-brand-brown-dark">
                🌐 {editPost ? 'Edit Post' : 'New Public Post'}
              </h2>
              <button onClick={closeModal} className="text-2xl text-brand-brown-light">×</button>
            </div>

            <div>
              <label className={lbl}>Title <span className="font-normal text-brand-brown-light">(optional)</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title…" className={field} />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className={lbl.replace('mb-1', '')}>Content *</label>
                <span className="text-[10.5px] text-brand-brown-light">{content.length.toLocaleString()} / 50,000</span>
              </div>
              <textarea
                value={content} onChange={(e) => setContent(e.target.value)}
                maxLength={50000} rows={8} placeholder="Write your post content here…"
                className={field + ' resize-y leading-relaxed'}
              />
            </div>

            {/* Images */}
            <div>
              <label className={lbl}>Images <span className="font-normal text-brand-brown-light">(optional · each auto-compressed to ≤900KB)</span></label>
              <div className="flex items-center gap-3 mb-3">
                <label className="cursor-pointer border border-brand-cream-dark rounded-md px-3 py-1.5 text-sm font-medium hover:bg-brand-cream">
                  📸 Add Images
                  <input
                    ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                  />
                </label>
                {uploading && <span className="text-xs text-brand-brown-light">{uploadStatus}</span>}
                {imgs.length > 0 && !uploading && <span className="text-xs text-brand-brown-light">{imgs.length} image{imgs.length > 1 ? 's' : ''} added</span>}
              </div>
              {imgs.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {imgs.map((im, i) => (
                    <div key={i} className="flex flex-col gap-1.5 bg-brand-cream rounded-lg p-2" style={{ width: 140 }}>
                      <div className="relative">
                        <img src={im.url} className="w-full h-20 rounded-md object-cover" />
                        <button onClick={() => removeImg(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger-700 text-white text-xs flex items-center justify-center">×</button>
                      </div>
                      <input
                        value={im.caption} onChange={(e) => updateImgField(i, 'caption', e.target.value)}
                        placeholder="Caption (optional)" className="text-[11px] border border-brand-cream-dark rounded px-2 py-1 w-full bg-white"
                      />
                      <div className="flex gap-1">
                        <button onClick={() => updateImgField(i, 'layout', 'column')} className="flex-1 text-[10px] py-1 rounded font-semibold" style={{ background: im.layout !== 'break' ? '#5D4037' : '#E8DDD0', color: im.layout !== 'break' ? '#fff' : '#5D4037' }}>⬛ Stack</button>
                        <button onClick={() => updateImgField(i, 'layout', 'break')} className="flex-1 text-[10px] py-1 rounded font-semibold" style={{ background: im.layout === 'break' ? '#7C3AED' : '#E8DDD0', color: im.layout === 'break' ? '#fff' : '#5D4037' }}>⬜ Break</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Publish status */}
            <div>
              <label className={lbl}>Publish Status</label>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer text-sm" style={{ borderColor: isPublished ? '#5D4037' : '#E8DDD0' }}>
                  <input type="radio" checked={isPublished} onChange={() => setIsPublished(true)} className="accent-brand-brown-dark" />
                  <span className="text-green-700">👁</span> Publish now (visible publicly)
                </label>
                <label className="flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer text-sm" style={{ borderColor: !isPublished ? '#5D4037' : '#E8DDD0' }}>
                  <input type="radio" checked={!isPublished} onChange={() => setIsPublished(false)} className="accent-brand-brown-dark" />
                  <span className="text-amber-600">🙈</span> Save as Draft
                </label>
              </div>
            </div>

            {error && <p className="text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving || uploading} className="flex-1 py-3 rounded-md bg-brand-brown-dark text-white font-semibold text-sm disabled:opacity-60">
                {saving ? 'Saving…' : editPost ? '✓ Save Changes' : '🚀 Publish Post'}
              </button>
              <button onClick={closeModal} className="px-4 py-3 rounded-md border border-brand-cream-dark text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Posts grid */}
      {posts.length === 0 ? (
        <div className="rounded-md border border-brand-cream-dark bg-white p-12 text-center">
          <div className="text-5xl mb-4 opacity-40">🌐</div>
          <div className="font-bold text-xl text-brand-brown-dark mb-2">No public posts yet</div>
          <p className="text-sm text-brand-brown-light mb-5">Posts created here are instantly visible on the public landing page.</p>
          <button onClick={openNew} className="px-5 py-2.5 rounded-md bg-brand-brown-dark text-white font-semibold">+ Create First Post</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((p) => {
            const imgs = normalizeImgs(p.image_urls ?? (p.image_url ? [p.image_url] : []));
            const preview = (p.content || '').length > 200 ? p.content.substring(0, 200) + '…' : p.content;
            const roleLabel = (p.author_role || 'admin').replace(/_/g, ' ').replace(/proprietor/i, 'School Director').toUpperCase();
            const busy = busyId === p.id;
            return (
              <div key={p.id} className="rounded-md border border-brand-cream-dark bg-white p-5 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {p.title
                      ? <div className="font-heading font-bold text-[15px] text-brand-brown-dark truncate">{p.title}</div>
                      : <div className="text-xs text-brand-brown-light italic">(No title)</div>
                    }
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full mt-1 ${p.is_published ? 'bg-success-700/10 text-success-700' : 'bg-brand-cream text-brand-brown-light'}`}>
                      {p.is_published ? '● Published' : '○ Draft'}
                    </span>
                  </div>
                  {imgs.length > 0 && (
                    <div className="relative shrink-0">
                      <img src={imgs[0].url} className="w-14 h-14 rounded-lg object-cover" />
                      {imgs.length > 1 && (
                        <span className="absolute -bottom-1 -right-1 bg-brand-brown-dark text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">+{imgs.length - 1}</span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-sm text-body leading-relaxed">{preview}</p>
                <div className="text-[11.5px] text-brand-brown-light">
                  👤 {p.author_name || 'Admin'} · {roleLabel} · 🕐 {fmtDate(p.created_at)}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => openEdit(p)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-brand-cream-dark text-xs font-semibold hover:bg-brand-cream disabled:opacity-50">
                    ✏️ Edit
                  </button>
                  <button onClick={() => handleTogglePublish(p.id, !p.is_published)} disabled={busy} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50 ${p.is_published ? 'bg-brand-cream text-brand-brown-dark' : 'bg-success-700/10 text-success-700'}`}>
                    {p.is_published ? '🙈 Unpublish' : '👁 Publish'}
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-danger-700 text-white text-xs font-semibold disabled:opacity-50">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
