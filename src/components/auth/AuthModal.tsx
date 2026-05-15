import React, { useState } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { X, Lock, User, ShieldQuestion, Loader2 } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { genDeviceAlias } from '@/src/lib/fingerprint';

// Simple SHA-256 hash for demo purposes without backend
async function hashPass(str: string) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function AuthModal() {
  const { authModalOpen, setAuthModalOpen, login } = useAppStore();
  const [mode, setMode] = useState<'login' | 'signup' | 'recover'>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  
  // Recovery specific
  const [recoverStep, setRecoverStep] = useState<1 | 2 | 3>(1);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [questionType, setQuestionType] = useState<string>("custom");
  const [customQuestion, setCustomQuestion] = useState("");
  const [fetchedQuestion, setFetchedQuestion] = useState('');
  const [newPassword, setNewPassword] = useState('');

  React.useEffect(() => {
    if (mode !== 'signup' || username.length < 3) {
      if (mode === 'signup' && username.length > 0 && username.length < 3) {
         setUsernameStatus('taken');
      } else {
         setUsernameStatus('idle');
      }
      return;
    }
    
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();
        
        if (error) {
          throw error;
        }
        
        if (data) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch (err: any) {
         // Fallback to local storage if supabase fails or RLS blocks read
         const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
         // Local duplicate check, case insensitive
         const isTaken = Object.keys(users).some(k => k.toLowerCase() === username.toLowerCase());
         if (isTaken) {
           setUsernameStatus('taken');
         } else {
           setUsernameStatus('available');
         }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [username, mode]);

  if (!authModalOpen) return null;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (username.length < 3) throw new Error("Username must be at least 3 characters");
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      if (usernameStatus === 'taken') throw new Error("Username is unavailable");
      
      const finalQuestion = questionType === 'custom' ? customQuestion : questionType;
      if (!finalQuestion || !answer) throw new Error("Security question and answer are required");
      
      const passHash = await hashPass(password);
      const answerHash = await hashPass(answer.toLowerCase().trim());
      
      // Upsert profile or create new
      const currentAlias = useAppStore.getState().alias || genDeviceAlias();
      
      // Since we don't have Edge functions deployed, we'll try to insert directly.
      // This relies on RLS being permissive or using mocked data if it fails.
      const { data, error: dbError } = await supabase
        .from('profiles')
        .insert({
          alias: currentAlias,
          username,
          secret_hash: passHash,
          recovery_question: finalQuestion,
          recovery_hash: answerHash,
          is_guest: false
        })
        .select()
        .single();
        
      if (dbError) {
        if (dbError.code === '23505') throw new Error("Username already taken");
        
        // Fallback for demo if supabase is not connected or RLS blocks:
        // We'll store it in localStorage as an emulator
        const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
        if (users[username]) throw new Error("Username already taken");
        users[username] = { username, passHash, question: finalQuestion, answerHash, alias: currentAlias };
        localStorage.setItem('mock_users', JSON.stringify(users));
        console.warn("Used local mock storage because Supabase failed:", dbError);
      }
      
      login(username, currentAlias, false);
      setAuthModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const passHash = await hashPass(password);
      
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('username, alias, secret_hash, is_guest')
        .eq('username', username)
        .single();
        
      if (dbError || !data) {
        // Fallback demo check
        const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
        const user = users[username];
        if (!user || user.passHash !== passHash) {
          throw new Error("Invalid username or password");
        }
        login(user.username, user.alias, false);
      } else {
        if (data.secret_hash !== passHash) throw new Error("Invalid username or password");
        login(data.username, data.alias, data.is_guest);
      }
      
      setAuthModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('recovery_question')
        .eq('username', username)
        .single();
      
      if (dbError || !data) {
        const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
        if (!users[username]) throw new Error("User not found");
        setFetchedQuestion(users[username].question);
      } else {
        if (!data.recovery_question) throw new Error("No recovery question set for this user");
        setFetchedQuestion(data.recovery_question);
      }
      setRecoverStep(2);
    } catch (err: any) {
      setError(err.message || "User not found");
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const answerHash = await hashPass(answer.toLowerCase().trim());
      
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('recovery_hash')
        .eq('username', username)
        .single();
        
      if (dbError || !data) {
        const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
        if (users[username].answerHash !== answerHash) throw new Error("Incorrect answer");
      } else {
        if (data.recovery_hash !== answerHash) throw new Error("Incorrect answer");
      }
      setRecoverStep(3);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };
  
  const handleRecoverReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (newPassword.length < 6) throw new Error("Password must be at least 6 characters");
      const passHash = await hashPass(newPassword);
      
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ secret_hash: passHash })
        .eq('username', username);
        
      if (dbError) {
        const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
        users[username].passHash = passHash;
        localStorage.setItem('mock_users', JSON.stringify(users));
      }
      
      // Auto login after reset
      const currentAlias = useAppStore.getState().alias || genDeviceAlias();
      login(username, currentAlias, false);
      setAuthModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0C0C0C] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeUp">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-100">
            {mode === 'signup' ? "Create Account" : mode === 'login' ? "Log In" : "Recover Account"}
          </h2>
          <button onClick={() => setAuthModalOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-[rgba(69,10,10,0.4)] border border-[rgba(127,29,29,0.5)] rounded-lg text-sm text-red-500">
              {error}
            </div>
          )}

          {/* SIGNUP FORM */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 block flex items-center justify-between">
                  Username
                  {usernameStatus === 'checking' && <Loader2 size={12} className="animate-spin text-zinc-500" />}
                  {usernameStatus === 'taken' && <span className="text-red-500 font-medium">Unavailable</span>}
                  {usernameStatus === 'available' && <span className="text-emerald-500 font-medium">Available</span>}
                </label>
                <div className="relative">
                  <User size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${usernameStatus === 'available' ? 'text-emerald-500' : usernameStatus === 'taken' ? 'text-red-500' : 'text-zinc-500'}`} />
                  <input required value={username} onChange={e => setUsername(e.target.value)} type="text" className={`w-full bg-zinc-900 border ${usernameStatus === 'taken' ? 'border-red-500/50' : usernameStatus === 'available' ? 'border-emerald-500/50' : 'border-zinc-800'} rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors`} placeholder="Choose a unique name" />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 block">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input required value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors" placeholder="Min 6 characters" />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 mt-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 block">Secret Question (For Password Recovery)</label>
                <div className="relative mb-3 flex flex-col gap-2">
                  <select 
                    value={questionType} 
                    onChange={e => {
                      setQuestionType(e.target.value);
                      if (e.target.value === 'birthday') {
                        setAnswer('');
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-3 px-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors appearance-none"
                  >
                    <option value="custom">Custom Question (Write your own)</option>
                    <option value="What is your childhood nickname?">What is your childhood nickname?</option>
                    <option value="What city were you born in?">What city were you born in?</option>
                    <option value="What is your favorite color?">What is your favorite color?</option>
                    <option value="What is your favorite food?">What is your favorite food?</option>
                    <option value="What was the name of your first school?">What was the name of your first school?</option>
                    <option value="birthday">What is your birthday?</option>
                  </select>
                  {questionType === 'custom' && (
                    <div className="relative">
                      <ShieldQuestion size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input required value={customQuestion} onChange={e => setCustomQuestion(e.target.value)} type="text" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors" placeholder="e.g. My childhood best friend?" />
                    </div>
                  )}
                </div>
                <div className="relative">
                  {questionType === 'birthday' ? (
                    <input required value={answer} onChange={e => setAnswer(e.target.value)} type="date" className="w-full bg-[#000] border border-orange-500 text-orange-500 font-mono rounded-lg py-2.5 px-3 text-sm outline-none transition-colors" />
                  ) : (
                    <input required value={answer} onChange={e => setAnswer(e.target.value)} type="text" className="w-full bg-[#000] border border-orange-500 text-orange-500 font-mono rounded-lg py-2.5 px-3 text-sm outline-none transition-colors" placeholder="Your secret answer..." />
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">Make sure you remember this! It's the ONLY way to recover your account.</p>
              </div>

              <button disabled={loading} type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold uppercase text-sm mt-2 transition-colors flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Save Info & Sync Devices"}
              </button>
              
              <p className="text-sm text-center mt-2 text-zinc-400">
                Already have an account? <button type="button" onClick={() => setMode('login')} className="text-orange-500 hover:underline">Log in</button>
              </p>
            </form>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 block">Username</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input required value={username} onChange={e => setUsername(e.target.value)} type="text" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors" placeholder="Your username" />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 block">Password</label>
                <div className="relative flex items-center">
                  <Lock size={16} className="absolute left-3 text-zinc-500" />
                  <input required value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors" placeholder="Your password" />
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => setMode('recover')} className="text-xs text-orange-500 hover:underline">Forgot password?</button>
              </div>

              <button disabled={loading} type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold uppercase text-sm mt-2 transition-colors flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Log In"}
              </button>
              
              <p className="text-sm text-center mt-2 text-zinc-400">
                Don't have an account? <button type="button" onClick={() => setMode('signup')} className="text-orange-500 hover:underline">Create one</button>
              </p>
            </form>
          )}

          {/* RECOVER FORM */}
          {mode === 'recover' && (
            <div className="flex flex-col gap-4">
              {recoverStep === 1 && (
                <form onSubmit={handleRecoverFetch} className="flex flex-col gap-4">
                  <p className="text-sm text-zinc-300">Enter your username to begin recovery.</p>
                  <div>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input required value={username} onChange={e => setUsername(e.target.value)} type="text" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors" placeholder="Your username" />
                    </div>
                  </div>
                  <button disabled={loading} type="submit" className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : "Next"}
                  </button>
                </form>
              )}

              {recoverStep === 2 && (
                <form onSubmit={handleRecoverVerify} className="flex flex-col gap-4">
                  <p className="text-sm text-emerald-500 font-medium">✓ User found. Answer your secret question:</p>
                  <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 text-sm italic text-zinc-300">
                    "{fetchedQuestion === 'birthday' ? 'What is your birthday?' : fetchedQuestion}"
                  </div>
                  <div>
                    <div className="relative">
                      {fetchedQuestion === 'birthday' ? (
                        <input required autoFocus value={answer} onChange={e => setAnswer(e.target.value)} type="date" className="w-full bg-[#000] border border-orange-500 text-orange-500 font-mono rounded-lg py-2.5 px-3 text-sm outline-none transition-colors" />
                      ) : (
                        <input required autoFocus value={answer} onChange={e => setAnswer(e.target.value)} type="text" className="w-full bg-[#000] border border-orange-500 text-orange-500 font-mono rounded-lg py-2.5 px-3 text-sm outline-none transition-colors" placeholder="Your secret answer..." />
                      )}
                    </div>
                  </div>
                  <button disabled={loading} type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : "Verify Answer"}
                  </button>
                </form>
              )}

              {recoverStep === 3 && (
                <form onSubmit={handleRecoverReset} className="flex flex-col gap-4">
                  <p className="text-sm text-emerald-500 font-medium">✓ Identity verified. Set a new password.</p>
                  <div>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input required autoFocus value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-orange-500 transition-colors" placeholder="New password" />
                    </div>
                  </div>
                  <button disabled={loading} type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : "Reset Password & Log In"}
                  </button>
                </form>
              )}

              <div className="mt-2 text-center">
                <button type="button" onClick={() => { setMode('login'); setRecoverStep(1); }} className="text-sm text-zinc-500 hover:text-zinc-300">Back to Login</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
