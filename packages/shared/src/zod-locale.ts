import { z } from 'zod';

// Default zod error messages to Vietnamese for both the API and the web forms.
// Schemas can still pass their own message where the generic one reads poorly.
z.config(z.locales.vi());
