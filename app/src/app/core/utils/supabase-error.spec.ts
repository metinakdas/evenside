import { describeSupabaseError, isSchemaMissing } from './supabase-error';

describe('supabase hata çevirisi', () => {
  it('eksik tabloyu tanır (PostgREST şema önbelleği)', () => {
    // Ölçülen gerçek yanıt: takım tabloları oluşturulmadan istek atıldığında bu geliyor.
    const error = { code: 'PGRST205', message: "Could not find the table 'public.squads' in the schema cache" };

    expect(isSchemaMissing(error)).toBeTrue();
    expect(describeSupabaseError(error, 'Takım kurulamadı.')).toContain('sunucu güncellemesi');
  });

  it('eksik sütunu tanır', () => {
    const error = { code: '42703', message: 'column players.owner_id does not exist' };

    expect(isSchemaMissing(error)).toBeTrue();
  });

  it('başka hatalarda normal mesaj korunur — her hatayı şemaya bağlamaz', () => {
    expect(describeSupabaseError({ code: '23505', message: 'duplicate key' }, 'Takım kurulamadı.')).toBe(
      'Takım kurulamadı.',
    );
    expect(describeSupabaseError(null, 'Takım kurulamadı.')).toBe('Takım kurulamadı.');
    expect(isSchemaMissing({ message: 'ağ hatası' })).toBeFalse();
  });
});
