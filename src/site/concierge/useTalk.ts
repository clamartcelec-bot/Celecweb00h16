import { useCallback } from 'react';
import { useVoiceRecorder, type Recording, type RecorderError } from '@/site/concierge/useVoiceRecorder';
import type { ConciergeApi, ConciergeContext } from '@/site/concierge/useConcierge';

const MIN_MS = 600;

const MIC_ERRORS: Record<RecorderError, string> = {
  denied: 'Le micro est bloqué. Autorisez-le dans les réglages du navigateur (icône à gauche de l’adresse), ou écrivez-moi.',
  unsupported: 'Ce navigateur ne permet pas l’enregistrement vocal. Vous pouvez m’écrire.',
  'no-device': 'Aucun micro n’a été trouvé. Vous pouvez m’écrire.',
  failed: 'Le micro n’a pas pu démarrer. Réessayez ou écrivez-moi.',
};

export function useTalk(api: ConciergeApi, context: () => ConciergeContext) {
  const submit = useCallback((rec: Recording | null) => {
    api.setPhase('ready');
    if (!rec) return;
    if (rec.durationMs < MIN_MS || rec.blob.size < 1_000) {
      api.setError('Trop court : restez appuyé pendant que vous parlez.');
      return;
    }
    void api.send({ audio: rec.blob, mime: rec.mime }, context());
  }, [api, context]);

  const recorder = useVoiceRecorder(submit);

  const begin = useCallback(async () => {
    api.stopAudio();
    api.cancel();
    api.setError(null);
    const err = await recorder.start();
    if (err) { api.setError(MIC_ERRORS[err]); return false; }
    api.setPhase('recording');
    return true;
  }, [api, recorder]);

  const finish = useCallback(async () => submit(await recorder.stop()), [recorder, submit]);

  const abort = useCallback(() => {
    recorder.cancel();
    api.setPhase('ready');
  }, [api, recorder]);

  return { recording: recorder.recording, level: recorder.level, begin, finish, abort };
}
