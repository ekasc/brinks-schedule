import { z } from 'zod';

const optionalText = z.string().trim().optional();
const validDate = z.string().min(1, 'Choose a time from the calendar — tap a day, then a slot.').refine((value) => !Number.isNaN(new Date(value).getTime()), 'That date isn’t valid — pick a slot from the calendar.');

export const bookJobSchema = z.object({
  client_name: z.string().trim().min(2, 'Full name needs at least 2 characters.').min(1, 'Full name is required.'),
  address: z.string().trim().min(5, 'Address needs at least 5 characters so the tech can find it.').min(1, 'Address is required.'),
  street: z.string().trim().min(2, 'Street needs at least 2 characters').optional().or(z.literal('')),
  city: z.string().trim().min(2, 'City needs at least 2 characters').optional().or(z.literal('')),
  province: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use 2-letter province, e.g. BC').optional().or(z.literal('')),
  postal_code: z.string().trim().regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Enter a valid Canadian postal code, e.g. V6A 1A1.').optional().or(z.literal('')),
  email: z.string().trim().email('That email doesn’t look right — try name@example.com or leave it blank.').optional().or(z.literal('')),
  dob: z.string().trim().refine((value) => value === '' || !Number.isNaN(new Date(value).getTime()), 'That date of birth isn’t valid — use YYYY-MM-DD.').optional(),
  telus_pin: z.string().trim().max(200, 'Keep it under 200 characters.').optional().or(z.literal('')),
  id_type: z.enum(['dl', 'passport', 'bcid', 'other'], { message: 'Pick Driver’s licence, Passport, BCID, or Other.' }).optional().or(z.literal('')),
  id_last4: z.string().trim().regex(/^.{4}$/, 'Last 4 of ID needs exactly 4 characters.').optional().or(z.literal('')),
  emergency_name: optionalText,
  emergency_number: optionalText,
  emergency_relation: optionalText,
  verbal_password: optionalText,
  themes: optionalText,
  security_offered: optionalText,
  notes: optionalText,
  tech_id: z.coerce.number().int().positive('Choose a technician for this job.'),
  starts_at: validDate,
  ends_at: validDate,
  svc_internet: z.boolean().default(false),
  svc_internet_detail: z.string().trim().max(120, 'Keep it under 120 characters.').optional().or(z.literal('')),
  svc_home_phone: z.boolean().default(false),
  svc_home_phone_detail: z.string().trim().max(120, 'Keep it under 120 characters.').optional().or(z.literal('')),
  svc_tv: z.boolean().default(false),
  svc_tv_detail: z.string().trim().max(120, 'Keep it under 120 characters.').optional().or(z.literal('')),
  phone: z.string().trim().regex(/^[+()\d\s-]{7,}$/, 'Enter a valid phone number.').optional().or(z.literal('')),
  price: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  lat: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().optional()),
  lng: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().optional())
}).refine((value) => new Date(value.ends_at).getTime() > new Date(value.starts_at).getTime(), {
  path: ['ends_at'], message: 'End time needs to be after the start — pick a later slot.'
});

export type BookJob = z.infer<typeof bookJobSchema>;
