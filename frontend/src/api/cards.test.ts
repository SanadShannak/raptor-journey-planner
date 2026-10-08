import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_HAS_BALANCE,
  CARD_LIMIT_REACHED,
  CARD_NOT_FOUND,
  DUPLICATE_CARD_NICKNAME,
  INSUFFICIENT_BALANCE,
  INVALID_AMOUNT,
  addCard,
  listCards,
  payFare,
  refreshCard,
  removeCard,
  topUpCard,
} from './cards';
import { ApiError } from './errors';

function respondWith(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Copied from live calls against a running backend. */
const CARD = {
  id: '6ac6b452417f754fdb2af6b5',
  number: '10000-00000-2',
  nickname: 'Work Card',
  cardType: 'Student',
  balance: 22.7,
  lastUsedDate: '2026-10-08',
  usages: [
    {
      date: '2026-10-08',
      time: '00:06',
      amount: 2.8,
      kind: 'fare',
      description: 'Deducted fare with amount EUR 2.800',
    },
    {
      date: '2026-10-08',
      time: '00:06',
      amount: 25.5,
      kind: 'topUp',
      description: 'Top up with amount EUR 25.500',
    },
  ],
};

describe('listCards', () => {
  it('reads a card, its type and its history', async () => {
    respondWith({ data: [CARD] });
    const cards = await listCards();

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: CARD.id,
      number: '10000-00000-2',
      nickname: 'Work Card',
      cardType: 'Student',
      balance: 22.7,
    });
    expect(cards[0]?.usages).toHaveLength(2);
  });

  it('reads an account with no cards as an empty wallet', async () => {
    respondWith({ data: [] });
    await expect(listCards()).resolves.toEqual([]);
  });

  /*
   * The type decides what the chooser shows as selected, so a value no control
   * can represent would leave the form unable to describe the card it is
   * editing. `Standard` is the server's own default.
   */
  it('falls back to Standard for a type this app does not know', async () => {
    respondWith({ data: [{ ...CARD, cardType: 'Platinum' }] });
    expect((await listCards())[0]?.cardType).toBe('Standard');
  });

  /*
   * A balance is the whole answer, so a response without a readable one is not
   * a card with an unknown balance — it is a response this app cannot read.
   */
  it('refuses a card with no readable balance', async () => {
    respondWith({ data: [{ id: 'x', number: '1' }] });
    await expect(listCards()).rejects.toBeInstanceOf(ApiError);
  });

  it('drops a history row with no amount or no direction', async () => {
    respondWith({
      data: [
        {
          ...CARD,
          usages: [
            { date: '2026-10-08', time: '00:06', amount: 2.8, kind: 'fare' },
            { date: '2026-10-08', time: '00:06', kind: 'fare' },
            { date: '2026-10-08', time: '00:06', amount: 1, kind: 'refund' },
          ],
        },
      ],
    });

    expect((await listCards())[0]?.usages).toHaveLength(1);
  });

  /* A row with no instant is still a row: the amount is the part being read. */
  it('keeps a history row that has an amount but no date', async () => {
    respondWith({
      data: [{ ...CARD, usages: [{ amount: 2.8, kind: 'fare', date: null, time: null }] }],
    });

    expect((await listCards())[0]?.usages[0]).toMatchObject({
      amount: 2.8,
      date: null,
      time: null,
    });
  });
});

describe('addCard', () => {
  /*
   * `POST /api/cards` runs `req.body.nickname.trim()` with no validator in
   * front of it, so a request without one is a 500 rather than a card named by
   * default. Refused locally instead.
   */
  it('refuses a blank name without making a request', async () => {
    const fetchMock = respondWith({ data: CARD }, 201);

    await expect(addCard({ nickname: '   ' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trims the name and sends the type when one was chosen', async () => {
    const fetchMock = respondWith({ data: CARD }, 201);
    await addCard({ nickname: '  Commute  ', cardType: 'Student' });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ nickname: 'Commute', cardType: 'Student' });
  });

  it('turns a 422 into "the wallet is full"', async () => {
    respondWith({ message: 'Limit of maximum 5 cards per user reached.' }, 422);

    const error = await addCard({ nickname: 'Sixth' }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(CARD_LIMIT_REACHED);
  });

  it('turns a bare 400 into "that name is taken"', async () => {
    respondWith({ message: 'Another card the user owns has the same nickname.' }, 400);

    const error = await addCard({ nickname: 'Work Card' }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(DUPLICATE_CARD_NICKNAME);
  });
});

describe('removeCard', () => {
  it('resolves when the card is gone', async () => {
    respondWith({ message: 'Card Removed Successfully', id: CARD.id });
    await expect(removeCard(CARD.id)).resolves.toBeUndefined();
  });

  /*
   * A card holds money and deleting is irreversible, so a card with a balance
   * is refused. The two 400s have to be told apart the same way the fare
   * endpoint's are: a rejected **id** names a field, the balance names none.
   */
  it('reads a fieldless 400 as "it still has money on it"', async () => {
    respondWith({ message: 'Card still has a balance.' }, 400);

    const error = await removeCard(CARD.id).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(CARD_HAS_BALANCE);
  });

  /* 409 is what "the thing is in a state that forbids this" is for, and the
     other reasonable choice for this refusal, so both are mapped. */
  it('reads a 409 the same way', async () => {
    respondWith({ message: 'Card still has a balance.' }, 409);

    const error = await removeCard(CARD.id).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(CARD_HAS_BALANCE);
  });

  it('keeps a rejected id a validation failure, not a balance refusal', async () => {
    respondWith({ errors: [{ msg: 'Card ID cannot be empty', path: 'id' }] }, 400);

    const error = await removeCard('').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('INVALID_SUBMISSION');
  });

  it('reads a 404 as no such card', async () => {
    respondWith({ message: 'Card not found or unauthorized to delete.' }, 404);

    const error = await removeCard(CARD.id).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(CARD_NOT_FOUND);
  });
});

describe('topUpCard and payFare', () => {
  /*
   * The amount travels as a **string**. The server's decimal-places rule runs
   * on whatever express-validator stringified it to, so sending the text the
   * reader typed means the rule tests what they actually wrote.
   */
  it('sends the amount exactly as typed', async () => {
    const fetchMock = respondWith({ data: CARD });
    await topUpCard(CARD.id, '25.500');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.amount).toBe('25.500');
  });

  it('posts to the endpoint for each direction', async () => {
    const fetchMock = respondWith({ data: CARD });
    await topUpCard(CARD.id, '10');
    await payFare(CARD.id, '2.8');

    expect(fetchMock.mock.calls[0]![0]).toContain(`/api/cards/${CARD.id}/top-up`);
    expect(fetchMock.mock.calls[1]![0]).toContain(`/api/cards/${CARD.id}/fare`);
  });

  /*
   * **The discrimination this file exists for.** Paying a fare can fail two
   * ways with the same status, and they need different words. A rejected
   * amount names fields; "Insufficient balance" names none — so the absence of
   * field errors is what identifies it. Matching on the server's English would
   * be the alternative, and this app never reads that string.
   */
  it('reads a fieldless 400 on a fare as "not enough on the card"', async () => {
    respondWith({ message: 'Insufficient balance' }, 400);

    const error = await payFare(CARD.id, '9999').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(INSUFFICIENT_BALANCE);
  });

  it('reads a 400 that names the amount as a bad amount', async () => {
    respondWith(
      {
        errors: [
          {
            type: 'field',
            value: '0',
            msg: 'Fare amount must be minimum EUR 0.01',
            path: 'amount',
            location: 'body',
          },
        ],
      },
      400,
    );

    const error = await payFare(CARD.id, '0').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(INVALID_AMOUNT);
  });

  /* A top-up has only the one meaning for a 400, and it is the amount. */
  it('reads any 400 on a top-up as a bad amount', async () => {
    respondWith({ errors: [{ msg: 'x', path: 'amount' }] }, 400);

    const error = await topUpCard(CARD.id, '0').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(INVALID_AMOUNT);
  });
});

describe('refreshCard', () => {
  /*
   * The one call that takes a number, and it must arrive **grouped**: the
   * server validates `XXXXX-XXXXX-X` before stripping the dashes, which is the
   * single place in this app where the punctuation is more than presentation.
   */
  it('sends the number with its grouping intact', async () => {
    const fetchMock = respondWith({ data: CARD });
    await refreshCard('10000-00000-2');

    expect(fetchMock.mock.calls[0]![0]).toContain('/api/cards/10000-00000-2');
  });

  /*
   * A 401 is deliberately left unmapped: this endpoint answers 401 both for an
   * expired session and for a card belonging to somebody else, and only the
   * first can happen here — the number came from this account's own list.
   */
  it('leaves a 401 as the session failure it must be', async () => {
    respondWith({ message: 'You do not own this card' }, 401);

    const error = await refreshCard('10000-00000-2').catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).code).toBeNull();
  });
});
