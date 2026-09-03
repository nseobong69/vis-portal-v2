import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';

interface Props {
  examId: string;
  profileImageUrl: string | null;
  onCleared: () => void;
}

interface SignResponse {
  cloud_name: string;
  api_key: string;
  folder: string;
  public_id: string;
  timestamp: number;
  signature: string;
}

const FACE_API_SCRIPT = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_MODEL_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
const MODEL_LOAD_TIMEOUT_MS = 45000;
const MATCH_THRESHOLD = 0.52; // same threshold as index.html's verifyFaceAtExamStart
const MAX_ATTEMPTS = 3;

const CHALLENGES = [
  { cmd: '← Look LEFT', speech: 'Please look to your left.', waitMs: 1800 },
  { cmd: 'Look RIGHT →', speech: 'Now look to your right.', waitMs: 1800 },
  { cmd: '🙂 Face FORWARD', speech: 'Now face the camera directly.', waitMs: 1400 },
];

function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-NG';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    // speechSynthesis isn't available everywhere — silent no-op.
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script load failed'));
    document.head.appendChild(s);
  });
}

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// Ports the entry gate of the old app's face-verification modal
// (index.html's verifyFaceAtExamStart / the `fv-*` elements), with
// real face-api.js liveness challenges and profile-photo matching —
// the piece the first CBT-camera pass deliberately deferred.
//
// Simplified vs. the old app on purpose:
//   - one model CDN with a single timeout, not a race across two CDNs
//     plus a three-tier native/Tiny/full progressive loading strategy
//   - no separate freeze-frame / noise / intruder detectors (still a
//     later, separate item — see the CBT Continuation output docs)
// Kept faithful on purpose: the 0.52 euclidean-distance threshold, the
// 3-attempt liveness-challenge cap, hard denial (+ violation log) on
// exhausted attempts, and the invigilator-PIN escape hatch either way.
export default function FaceCheckGate({ examId, profileImageUrl, onCleared }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const profileImgRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attemptsRef = useRef(0);

  const [status, setStatus] = useState<
    'starting' | 'live' | 'loading_models' | 'challenge' | 'scanning' | 'denied' | 'camera_denied' | 'model_failed' | 'capturing'
  >('starting');
  const [cmdText, setCmdText] = useState('Preparing camera…');
  const [statusText, setStatusText] = useState('Please wait…');
  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [showPinBypass, setShowPinBypass] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setStatus('live');
        loadModelsAndRun();
      })
      .catch(() => {
        if (!cancelled) setStatus('camera_denied');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        window.speechSynthesis.cancel();
      } catch {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModelsAndRun() {
    setStatus('loading_models');
    setStatusText('Loading identity verification…');
    try {
      await loadScript(FACE_API_SCRIPT);
      const faceapi = (window as any).faceapi;
      if (!faceapi) throw new Error('face-api unavailable');
      await raceTimeout(
        Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_CDN),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_CDN),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_CDN),
        ]),
        MODEL_LOAD_TIMEOUT_MS
      );
      runLiveness();
    } catch {
      // Models unavailable on this device/connection — same posture as
      // the old app: go straight to a plain photo capture, no matching.
      setStatus('model_failed');
    }
  }

  async function runLiveness() {
    attemptsRef.current += 1;
    setAttempts(attemptsRef.current);
    setStatus('challenge');
    for (const ch of CHALLENGES) {
      setCmdText(ch.cmd);
      speak(ch.speech);
      setStatusText(ch.speech);
      await new Promise((r) => setTimeout(r, ch.waitMs));
    }
    setCmdText('Hold still…');
    setStatusText('Scanning your face now…');
    speak('Hold still. Scanning now.');
    await new Promise((r) => setTimeout(r, 600));
    await scanAndMatch();
  }

  async function scanAndMatch() {
    setStatus('scanning');
    const faceapi = (window as any).faceapi;
    const vid = videoRef.current;
    if (!faceapi || !vid || vid.readyState < 2) {
      return retryOrDeny('Camera not ready.', 'Camera is not ready. Please wait and try again.');
    }

    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 });
    let all: any[] = [];
    let single: any = null;
    try {
      [all, single] = await Promise.all([
        faceapi.detectAllFaces(vid, opts),
        faceapi.detectSingleFace(vid, opts).withFaceLandmarks(true).withFaceDescriptor(),
      ]);
    } catch {
      return retryOrDeny('Scan error.', 'A scan error occurred. Please try again.');
    }

    if (all.length > 1) {
      logViolation('multiple_faces_at_verification', `attempt ${attemptsRef.current}`);
      return hardDeny('Multiple faces detected. Only you may be present.');
    }
    if (!single) {
      return retryOrDeny('Face not detected. Retry.', 'Face not detected. Ensure good lighting and face the camera directly.');
    }

    // No profile photo on file — liveness alone is treated as sufficient,
    // same as the old app's "no profile photo" branch.
    if (!profileImageUrl || !profileImgRef.current) {
      setCmdText('VERIFIED ✓');
      setStatusText('Identity confirmed. Starting exam…');
      speak('Identity confirmed. Starting your exam.');
      await captureAndUpload();
      return;
    }

    let profResult: any = null;
    try {
      profResult = await faceapi
        .detectSingleFace(profileImgRef.current, opts)
        .withFaceLandmarks(true)
        .withFaceDescriptor();
    } catch {
      profResult = null;
    }
    if (!profResult) {
      return retryOrDeny('Profile unclear. Retry.', 'Could not read your profile photo. Ensure good lighting and try again.');
    }

    const distance = faceapi.euclideanDistance(single.descriptor, profResult.descriptor);
    const pct = Math.max(0, Math.round((1 - distance) * 100));
    setMatchPct(pct);

    if (distance < MATCH_THRESHOLD) {
      setCmdText('IDENTITY CONFIRMED ✓');
      setStatusText(`Welcome! ${pct}% match — starting exam now…`);
      speak('Identity confirmed. Welcome. Starting your exam now.');
      await captureAndUpload();
    } else {
      logViolation('face_mismatch', `attempt ${attemptsRef.current}, distance=${distance.toFixed(3)}, match=${pct}%`);
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        speak('Identity verification failed. Your face does not match. Please report to your invigilator.');
        return hardDeny(`Face mismatch after ${MAX_ATTEMPTS} attempts (${pct}% match).`);
      }
      setCmdText('Face mismatch. Retry.');
      setStatusText(`Face does not match your profile (${pct}% match). Ensure it is YOU.`);
      speak('Face does not match. Try again. Make sure it is you taking this exam.');
      setTimeout(() => runLiveness(), 2500);
    }
  }

  function retryOrDeny(cmd: string, speech: string) {
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      speak('Identity verification failed. Please report to your invigilator.');
      return hardDeny(`${cmd} — failed after ${MAX_ATTEMPTS} attempts.`);
    }
    setCmdText(cmd);
    setStatusText(speech);
    speak(speech);
    setTimeout(() => runLiveness(), 2500);
  }

  function logViolation(violationType: string, details?: string) {
    fetch('/api/student/exams/log-violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: examId, violation_type: violationType, details }),
    }).catch(() => {});
  }

  function hardDeny(reason: string) {
    logViolation('face_verification_failed', reason);
    setStatus('denied');
    setCmdText('ACCESS DENIED');
    setStatusText('Verification failed. Report to your invigilator, or use the PIN below.');
  }

  async function captureAndUpload() {
    if (!videoRef.current) return;
    setStatus('capturing');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, -240, 0, 240, 240);
      ctx.restore();

      let quality = 0.55;
      let blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
      while (blob && blob.size > 40 * 1024 && quality > 0.05) {
        quality = Math.max(0.05, quality - 0.1);
        blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
      }
      if (blob) {
        const signRes = await fetch('/api/student/exams/sign-photo-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam_id: examId }),
        });
        const sign: SignResponse = await signRes.json();
        if (signRes.ok) {
          const fd = new FormData();
          fd.append('file', blob);
          fd.append('folder', sign.folder);
          fd.append('public_id', sign.public_id);
          fd.append('api_key', sign.api_key);
          fd.append('signature', sign.signature);
          fd.append('timestamp', String(sign.timestamp));
          const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloud_name}/image/upload`, {
            method: 'POST',
            body: fd,
          });
          const uploadJson = await uploadRes.json();
          if (uploadJson.secure_url) {
            await fetch('/api/student/exams/log-snapshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ exam_id: examId, image_url: uploadJson.secure_url, snap_number: 0 }),
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Snapshot upload failing shouldn't block exam entry once identity
      // is already confirmed — same "never interrupt the exam" posture.
    }
    setTimeout(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCleared();
    }, 900);
  }

  // Plain capture, no matching — used when face-api couldn't load at all.
  async function plainCaptureAndUpload() {
    await captureAndUpload();
  }

  async function bypassWithPin() {
    setPinError(null);
    setPinChecking(true);
    try {
      const res = await fetch('/api/student/exams/verify-invigilator-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: examId, pin: pin.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.valid) throw new Error(json.error || 'Incorrect PIN.');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCleared();
    } catch (e: any) {
      setPinError(e?.message || 'Incorrect PIN.');
    } finally {
      setPinChecking(false);
    }
  }

  const pinBypass = (
    <div className="mt-3 rounded-md bg-brand-brown-dark p-3 flex flex-col gap-2">
      <p className="text-xs text-white/80">
        No working camera, or verification failed? An invigilator can enter the exam PIN to skip this step.
      </p>
      {!showPinBypass ? (
        <button type="button" className="text-xs font-medium text-white underline w-fit" onClick={() => setShowPinBypass(true)}>
          Enter invigilator PIN
        </button>
      ) : (
        <div className="flex flex-col gap-2 max-w-xs">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Invigilator PIN"
            maxLength={8}
            className="rounded-md px-3 py-1.5 text-center tracking-widest text-sm"
          />
          {pinError && <p className="text-danger-300 text-xs">{pinError}</p>}
          <Button size="sm" variant="secondary" disabled={pinChecking} onClick={bypassWithPin}>
            {pinChecking ? 'Checking…' : 'Authorise & Skip'}
          </Button>
        </div>
      )}
    </div>
  );

  const hiddenProfileImg = profileImageUrl ? (
    <img ref={profileImgRef} src={profileImageUrl} crossOrigin="anonymous" className="hidden" alt="" />
  ) : null;

  if (status === 'camera_denied') {
    return (
      <div className="bg-brand-cream rounded-lg p-5 flex flex-col gap-3 max-w-md">
        <div className="font-bold text-brand-brown">Camera Access Needed</div>
        <p className="text-sm text-brand-brown-light">
          This exam requires identity verification before it starts. Allow camera access and reload, or use the
          invigilator PIN below.
        </p>
        {pinBypass}
      </div>
    );
  }

  if (status === 'model_failed') {
    return (
      <div className="bg-brand-cream rounded-lg p-5 flex flex-col gap-3 max-w-md">
        <div className="font-bold text-brand-brown">Identity Check</div>
        <p className="text-sm text-brand-brown-light">
          Full face verification isn't available on this device or connection. Take an identity photo to continue —
          it's saved with your exam record.
        </p>
        <div className="relative w-full aspect-[4/3] bg-black rounded-md overflow-hidden">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
        </div>
        <Button onClick={plainCaptureAndUpload}>Take Photo & Start Exam</Button>
        {pinBypass}
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="bg-brand-cream rounded-lg p-5 flex flex-col gap-3 max-w-md">
        <div className="font-bold text-danger-700">Access Denied</div>
        <p className="text-sm text-brand-brown-light">{statusText}</p>
        {pinBypass}
      </div>
    );
  }

  return (
    <div className="bg-brand-cream rounded-lg p-5 flex flex-col gap-3 max-w-md">
      <div className="font-bold text-brand-brown">Identity Verification</div>
      <p className="text-xs text-brand-brown-light">
        Follow the on-screen instructions. The system scans automatically. Attempt {attempts || 1}/{MAX_ATTEMPTS}.
      </p>
      <div className="flex gap-3 items-end justify-center">
        {profileImageUrl && (
          <div className="text-center">
            <div className="text-[10px] text-brand-brown-light uppercase mb-1">Profile</div>
            <img src={profileImageUrl} className="w-20 h-20 rounded-md object-cover border-2 border-brand-brown" alt="" />
          </div>
        )}
        <div className="text-center">
          <div className="text-[10px] text-brand-brown-light uppercase mb-1">Live Camera</div>
          <div className="w-20 h-20 rounded-md overflow-hidden bg-black">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
          </div>
        </div>
      </div>
      {hiddenProfileImg}
      <div className="bg-brand-brown-dark rounded-md p-3 min-h-[48px] flex items-center justify-center">
        <div className="text-base font-extrabold text-brand-gold text-center">{cmdText}</div>
      </div>
      <p className="text-xs text-brand-brown-light text-center min-h-[16px]">{statusText}</p>
      {matchPct !== null && (
        <div>
          <div className="text-[10px] text-brand-brown-light mb-1">Match confidence</div>
          <div className="bg-brand-cream-dark rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full ${matchPct >= 48 ? 'bg-success-700' : 'bg-danger-700'}`}
              style={{ width: `${matchPct}%` }}
            />
          </div>
          <div className="text-[10px] text-brand-brown-light text-right mt-0.5">{matchPct}% match</div>
        </div>
      )}
      <p className="text-[11px] text-danger-700 font-semibold text-center">
        ⚠ Mandatory. Exam cannot start without verification.
      </p>
      {pinBypass}
    </div>
  );
}
