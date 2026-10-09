'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AvatarEditor } from '@/components/settings/avatar-editor';
import { formatIban } from '@/lib/payments';

// Rendered only once the profile has loaded, so all fields can be
// initialized directly from the data (no sync-from-query effects that
// could clobber in-progress edits).
function ProfileForm({
  email,
  initialName,
  initialVenmoUsername,
  initialPaypalEmail,
  initialPaypalMeName,
  initialIban,
  initialIbanHolder,
}: {
  email: string;
  initialName: string;
  initialVenmoUsername: string;
  initialPaypalEmail: string;
  initialPaypalMeName: string;
  initialIban: string;
  initialIbanHolder: string;
}) {
  const t = useTranslations('settings');
  const { update } = useSession();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [venmoUsername, setVenmoUsername] = useState(initialVenmoUsername);
  const [paypalEmail, setPaypalEmail] = useState(initialPaypalEmail);
  const [paypalMeName, setPaypalMeName] = useState(initialPaypalMeName);
  const [iban, setIban] = useState(initialIban ? formatIban(initialIban) : '');
  const [ibanHolder, setIbanHolder] = useState(initialIbanHolder);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await update();
      router.refresh();
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateProfile.mutate({
      name,
      venmoUsername: venmoUsername.trim() || null,
      paypalEmail: paypalEmail.trim() || null,
      paypalMeName: paypalMeName.trim() || null,
      iban: iban.trim() || null,
      ibanHolder: ibanHolder.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t('profile.email')}</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">{t('profile.name')}</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="venmo">{t('profile.venmo')}</Label>
        <Input
          id="venmo"
          value={venmoUsername}
          onChange={(e) => setVenmoUsername(e.target.value)}
          placeholder={t('profile.venmoPlaceholder')}
          data-testid="venmo-username-input"
        />
      </div>
      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">{t('payments.title')}</p>
          <p className="text-xs text-muted-foreground">{t('payments.hint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="paypal-email">{t('payments.paypalEmail')}</Label>
          <Input
            id="paypal-email"
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="name@example.com"
            data-testid="paypal-email-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paypal-me">{t('payments.paypalMe')}</Label>
          <Input
            id="paypal-me"
            value={paypalMeName}
            onChange={(e) => setPaypalMeName(e.target.value)}
            placeholder="paypal.me/name"
            data-testid="paypal-me-input"
          />
          <p className="text-xs text-muted-foreground">{t('payments.paypalMeHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="iban">IBAN</Label>
          <Input
            id="iban"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="DE00 0000 0000 0000 0000 00"
            autoComplete="off"
            data-testid="iban-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="iban-holder">{t('payments.ibanHolder')}</Label>
          <Input
            id="iban-holder"
            value={ibanHolder}
            onChange={(e) => setIbanHolder(e.target.value)}
            maxLength={70}
            data-testid="iban-holder-input"
          />
        </div>
      </div>
      <Button type="submit" disabled={updateProfile.isPending} data-testid="save-profile-btn">
        {updateProfile.isPending ? t('profile.saving') : t('profile.save')}
      </Button>
      {updateProfile.isSuccess && <p className="text-sm text-green-600">{t('profile.saved')}</p>}
      {updateProfile.error && <p className="text-sm text-red-600">{updateProfile.error.message}</p>}
    </form>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const { data: session } = useSession();

  const profile = trpc.auth.getProfile.useQuery();
  const loginOptions = trpc.auth.getLoginOptions.useQuery();
  // SSO / magic-link-only accounts have no password to change, and with
  // password login disabled a password would be useless anyway. Hidden while
  // the options load (no flash); shown if they fail to load, since the server
  // still enforces the setting.
  const passwordLoginEnabled = loginOptions.isSuccess ? loginOptions.data.passwordLogin : loginOptions.isError;
  const showPasswordCard = profile.data?.hasPassword === true && passwordLoginEnabled;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
  });

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    changePassword.mutate({ currentPassword, newPassword });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.data ? (
            <div className="space-y-6">
              <AvatarEditor userId={profile.data.id} name={profile.data.name} image={profile.data.image} />
              <ProfileForm
                email={profile.data.email ?? session?.user?.email ?? ''}
                initialName={profile.data.name ?? session?.user?.name ?? ''}
                initialVenmoUsername={profile.data.venmoUsername ?? ''}
                initialPaypalEmail={profile.data.paypalEmail ?? ''}
                initialPaypalMeName={profile.data.paypalMeName ?? ''}
                initialIban={profile.data.iban ?? ''}
                initialIbanHolder={profile.data.ibanHolder ?? ''}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-9 w-full animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showPasswordCard && (
        <Card>
          <CardHeader>
            <CardTitle>{t('password.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">{t('password.current')}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  minLength={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('password.new')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('password.confirm')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-sm text-red-600">{t('password.mismatch')}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={
                  changePassword.isPending || newPassword !== confirmPassword || !currentPassword || !newPassword
                }
              >
                {changePassword.isPending ? t('password.submitting') : t('password.submit')}
              </Button>
              {changePassword.isSuccess && <p className="text-sm text-green-600">{t('password.success')}</p>}
              {changePassword.error && <p className="text-sm text-red-600">{changePassword.error.message}</p>}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
