import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';

const ChangePasswordModal = ({ onClose, onConfirm }) => {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            alert('As senhas não coincidem!');
            return;
        }
        onConfirm(oldPassword, newPassword);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex gap-2">
                        <Lock size={18} className="text-blue-600" /> Alterar Senha
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha Atual</label>
                        <input type="password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nova Senha</label>
                        <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirmar Nova Senha</label>
                        <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
                    </div>
                    <div className="pt-2 flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 px-6 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-all">Cancelar</button>
                        <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg">Salvar Senha</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
