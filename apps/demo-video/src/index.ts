import { registerRoot } from 'remotion';
// Fonts are registered before the root so the first frame may already use them.
import './fonts';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
