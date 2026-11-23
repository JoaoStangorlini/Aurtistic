// Este programa é um software livre (Licença AGPLv3)
'use server';

import {
  performLogin,
  performPasswordReset,
  performSignup,
} from '@/lib/auth-actions-core';

/**
 * Autenticação padrão de Usuário e Senha do Aurtistic
 */
export async function login(formData: FormData) {
  return performLogin(formData, { defaultRedirect: '/', revalidateTarget: '/' });
}

/**
 * Cadastro direto de nova conta no Aurtistic
 */
export async function signup(formData: FormData) {
  return performSignup(formData, { defaultRedirect: '/', revalidateTarget: '/' });
}

/**
 * Envio de link de redefinição de senha para contas com e-mail real
 */
export async function requestPasswordReset(email: string) {
  return performPasswordReset(email);
}
