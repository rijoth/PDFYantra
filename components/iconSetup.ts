import { config } from '@fortawesome/fontawesome-svg-core';
// Ship the icon base CSS from the bundle instead of injecting a <style> tag at runtime.
import '@fortawesome/fontawesome-svg-core/styles.css';

config.autoAddCss = false;
